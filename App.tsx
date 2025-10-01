import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SeatingChart, LayoutObject, SavedClassroom } from './types';
import { generateSeatingArrangement } from './services/geminiService';
import LayoutPreview from './components/LayoutPreview';
import GeneratedChart from './components/GeneratedChart';
import { useSpeechRecognition } from './useSpeechRecognition';
import LayoutEditor, { parseLayoutMatrixToObjects, convertObjectsToLayoutMatrix, DESK_HEIGHT_UNITS } from './components/LayoutEditor';
import ManageLayoutsModal from './components/ManageLayoutsModal';


// Fix: Add types for jspdf and html2canvas on the window object to resolve TypeScript errors.
declare global {
  interface Window {
    jspdf: any;
    html2canvas: any;
  }
}

const LAYOUTS_STORAGE_KEY = 'classroom-layouts';


const defaultLayout = '11,11,11\n11,11,11\n11,11,11\n11,11,11\n11,11,11';

const App: React.FC = () => {
  const [layoutObjects, setLayoutObjects] = useState<LayoutObject[]>([]);
  const [students, setStudents] = useState<string>('');
  const [conditions, setConditions] = useState<string>('');
  const [seatingChart, setSeatingChart] = useState<SeatingChart | null>(null);
  const [finalArrangement, setFinalArrangement] = useState<LayoutObject[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [editorLayoutObjects, setEditorLayoutObjects] = useState<LayoutObject[]>([]);

  const [savedLayouts, setSavedLayouts] = useState<SavedClassroom[]>([]);
  const [isManageLayoutsModalOpen, setIsManageLayoutsModalOpen] = useState(false);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  
  const [dictationTarget, setDictationTarget] = useState<'students' | 'conditions' | null>(null);
  const baseTextOnListenStart = useRef<string>(''); // Stores the text from *before* dictation starts.

  const capitalizeNames = (text: string): string => {
    return text
      .split(' ')
      .map(word => 
        word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''
      )
      .join(' ');
  };

  const handleDictationResult = useCallback((transcript: string, isFinal: boolean) => {
    if (!dictationTarget) return;

    let processedTranscript: string;
    if (dictationTarget === 'students') {
        // Vyčistíme přepis od interpunkce, abychom správně oddělili jména.
        const cleanedTranscript = transcript.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
        const capitalized = capitalizeNames(cleanedTranscript);

        // Heuristika: rozdělí přepis na jména (typicky 2 slova) a umístí každé na nový řádek.
        const words = capitalized.split(' ').filter(w => w.length > 0);
        const names = [];
        for (let i = 0; i < words.length; i += 2) {
            if (words[i + 1]) {
                names.push(`${words[i]} ${words[i + 1]}`);
            } else {
                names.push(words[i]); // Pro případ lichého počtu slov
            }
        }
        processedTranscript = names.join('\n');
    } else {
        // For conditions, just use the transcript but capitalize the first letter.
        processedTranscript = transcript.charAt(0).toUpperCase() + transcript.slice(1);
    }

    const separator = dictationTarget === 'students' ? '\n' : ' ';
    const currentBase = baseTextOnListenStart.current;
    
    // Vždy rekonstruujeme z původního textu + celého přepisu z aktuální relace.
    const liveText = (currentBase ? `${currentBase}${separator}` : '') + processedTranscript;

    if (dictationTarget === 'students') {
      setStudents(liveText);
    } else {
      setConditions(liveText);
    }
  }, [dictationTarget]);

  const { isListening, startListening, stopListening, hasRecognitionSupport } = useSpeechRecognition({
    onResult: handleDictationResult,
  });
  
  // Clear dictation target when listening stops
  useEffect(() => {
    if (!isListening) {
      setDictationTarget(null);
    }
  }, [isListening]);


  const handleMicClick = (target: 'students' | 'conditions') => {
    if (isListening) {
      stopListening();
    } else {
       if (target === 'conditions') {
        // When modifying an arrangement, clear the previous instruction on mic click.
        if (finalArrangement) {
            setConditions('');
            baseTextOnListenStart.current = '';
        } else {
            // Otherwise, for initial generation, append to existing conditions.
            baseTextOnListenStart.current = conditions.trim();
        }
      } else { // target === 'students'
        baseTextOnListenStart.current = students.trim();
      }
      setDictationTarget(target);
      startListening();
    }
  };

  // On initial load, load saved layouts and set a default.
  useEffect(() => {
    try {
        const storedLayoutsRaw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
        if (storedLayoutsRaw) {
            const storedLayouts = JSON.parse(storedLayoutsRaw);
            setSavedLayouts(storedLayouts);
        }
    } catch (error) {
        console.error("Failed to load layouts from localStorage", error);
    }
    // Always start with the default layout in the editor view.
    // The user can then explicitly load a different one.
    setLayoutObjects(parseLayoutMatrixToObjects(defaultLayout));
  }, []);

  const handleEnterEditMode = () => {
    setEditorLayoutObjects(layoutObjects); // Pass a copy to the editor
    setIsEditingLayout(true);
  };

  const handleSaveLayout = (newObjects: LayoutObject[]) => {
    setLayoutObjects(newObjects); // Update the main state with the new layout
    setIsEditingLayout(false);
  };

  const handleCancelEdit = () => {
    setIsEditingLayout(false);
  };

  const handleSaveLayoutToStorage = (name: string, layout: LayoutObject[], arrangement: LayoutObject[] | null) => {
    const newSavedClassroom: SavedClassroom = { name, layout, arrangement };
    const existingLayoutIndex = savedLayouts.findIndex(l => l.name === name);

    let updatedLayouts;
    if (existingLayoutIndex > -1) {
        // Update existing layout
        updatedLayouts = [...savedLayouts];
        updatedLayouts[existingLayoutIndex] = newSavedClassroom;
    } else {
        // Add new layout
        updatedLayouts = [...savedLayouts, newSavedClassroom];
    }
    
    // Sort alphabetically by name
    updatedLayouts.sort((a, b) => a.name.localeCompare(b.name));

    try {
        localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(updatedLayouts));
        setSavedLayouts(updatedLayouts);
    } catch (error) {
        console.error("Failed to save layout to localStorage", error);
        setError("Nepodařilo se uložit rozložení.");
    }
  };

  const handleLoadLayoutFromStorage = (layout: LayoutObject[], arrangement: LayoutObject[] | null) => {
      setLayoutObjects(layout);
      setFinalArrangement(arrangement || null);
      setSeatingChart(null); // Clear raw chart, as it's not saved and will be derived if needed
      setIsManageLayoutsModalOpen(false); // Close modal on load
  };

  const handleDeleteLayoutFromStorage = (name: string) => {
      const updatedLayouts = savedLayouts.filter(l => l.name !== name);
      try {
          localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(updatedLayouts));
          setSavedLayouts(updatedLayouts);
      } catch (error) {
          console.error("Failed to delete layout from localStorage", error);
          setError("Nepodařilo se smazat rozložení.");
      }
  };

  const handleExportData = () => {
    try {
        const dataStr = JSON.stringify(savedLayouts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'zasedaci-poradek-data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Failed to export data", err);
        setError("Nepodařilo se exportovat data.");
    }
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result as string;
              const data = JSON.parse(text);
              if (Array.isArray(data) && (data.length === 0 || (data[0].name && data[0].layout))) {
                  setSavedLayouts(data);
                  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(data));
                  alert('Data byla úspěšně naimportována.');
              } else {
                  throw new Error('Invalid file format');
              }
          } catch (err) {
              console.error("Failed to import data", err);
              setError("Nepodařilo se naimportovat data. Soubor je poškozený nebo má nesprávný formát.");
          }
      };
      reader.readAsText(file);
      if(event.target) {
          event.target.value = '';
      }
  };


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setStudents(text);
      };
      reader.readAsText(file);
    }
  };

  const handleClearChart = () => {
    if (finalArrangement) {
        const studentsFromChart = [
          ...new Set(
            finalArrangement
              .flatMap(desk => desk.students || [])
              .filter((s): s is string => !!s && s.trim() !== '')
          ),
        ].sort();
        // Update the main student list with everyone from the final arrangement,
        // including any newly added students.
        setStudents(studentsFromChart.join('\n'));
    }
    setSeatingChart(null);
    setFinalArrangement(null);
    setConditions(''); // Reset conditions to empty
    setError(null);
  };
  

  const handleGenerateClick = async () => {
    setError(null);
    setIsLoading(true);
    setSeatingChart(null);

    const isModification = finalArrangement !== null;
    
    // Convert the visual layout objects to the matrix format required by the AI
    const { matrix, layout, positionMap, numberedMatrix } = convertObjectsToLayoutMatrix(layoutObjects);
    
    if (!matrix || layout.length === 0) {
        setError('Rozložení lavic je prázdné. Přidejte lavice v editoru.');
        setIsLoading(false);
        return;
    }

    let studentList: string[];
    let currentArrangementMatrix: string | null = null;
    
    if (isModification && finalArrangement) {
        // Fix: A complex chained expression was causing a subtle type inference error. By splitting the
        // operation into two steps and using a type guard, we ensure TypeScript correctly infers `string[]`.
        const studentNamesWithDuplicates = finalArrangement
            .flatMap(desk => desk.students || [])
            .filter((s): s is string => !!s && s.trim() !== '');
        studentList = [...new Set(studentNamesWithDuplicates)];
        
        // Fix: Explicitly type `arrangementGrid` as `string[][]`. Without this, TypeScript infers a
        // stricter type like `("--" | "[prázdná]")[][]`, causing an error when assigning dynamic student names.
        const arrangementGrid: string[][] = layout.map(row => row.map(cell => cell === '--' ? '--' : '[prázdná]'));
        
        finalArrangement.forEach(deskInArrangement => {
            let r_idx = -1, c_idx = -1;
            for(const pos in positionMap) {
                if (positionMap[pos] === deskInArrangement.id) {
                    [r_idx, c_idx] = pos.split('-').map(Number);
                    break;
                }
            }
            if(r_idx !== -1 && c_idx !== -1) {
                if (deskInArrangement.students && deskInArrangement.students.length > 0) {
                    // Critical Fix: Map nulls to 'prázdné' to preserve empty seat positions for the AI.
                    const studentsInDesk = deskInArrangement.students.map(s => s || 'prázdné').join(', ');
                    arrangementGrid[r_idx][c_idx] = `[${studentsInDesk}]`;
                } else {
                    arrangementGrid[r_idx][c_idx] = '[prázdná]';
                }
            }
        });
        currentArrangementMatrix = arrangementGrid.map(row => row.map(cell => cell.padEnd(25)).join(' ')).join('\n');
    } else {
        setFinalArrangement(null); // Ensure we start fresh
        studentList = students.trim().split('\n').filter(s => s.trim() !== '');
        if (studentList.length === 0) {
            setError('Seznam žáků je prázdný.');
            setIsLoading(false);
            return;
        }

        let availableSeats = 0;
        layoutObjects.forEach(desk => {
            if (desk && desk.type !== '--') {
                const numUserBlocked = desk.userBlockedSeats?.length || 0;
                let potentialSeats = 0;
                if (desk.type.includes('1')) {
                    potentialSeats = (desk.type.match(/1/g) || []).length;
                } else {
                    potentialSeats = (desk.type.match(/0/g) || []).length;
                }
                availableSeats += (potentialSeats - numUserBlocked);
            }
        });

        if (studentList.length > availableSeats) {
            setError(`Nedostatek míst. Počet žáků (${studentList.length}) přesahuje počet dostupných míst (${availableSeats}).`);
            setIsLoading(false);
            return;
        }
    }
    
    const sortedForNumbering = [...layoutObjects].sort((a, b) => {
        const yDifference = a.y - b.y;
        if (Math.abs(yDifference) > DESK_HEIGHT_UNITS / 2) {
            return b.y - a.y;
        }
        return a.x - b.x;
    });

    const additionalConditions: string[] = [];
    layoutObjects.forEach(desk => {
        if (desk.userBlockedSeats && desk.userBlockedSeats.length > 0) {
            const deskIndex = sortedForNumbering.findIndex(d => d.id === desk.id);
            if (deskIndex !== -1) {
                const deskNumber = deskIndex + 1;
                desk.userBlockedSeats.forEach(seatIndex => {
                    additionalConditions.push(`V lavici č. ${deskNumber} je místo č. ${seatIndex + 1} (zleva) blokováno a nelze jej obsadit.`);
                });
            }
        }
    });

    const finalConditions = [conditions, ...additionalConditions].join('\n').trim();

    const result = await generateSeatingArrangement(matrix, studentList, finalConditions, numberedMatrix, currentArrangementMatrix);
    
    if (result.error) {
      setError(result.error);
    } else if (result.seating) {
      const populatedLayoutObjects = layoutObjects.map(obj => ({...obj, students: [] as (string | null)[] }));
      
      result.seating.forEach((row, rowIndex) => {
        row.forEach((deskStudents, colIndex) => {
          if (deskStudents) {
            const objectId = positionMap[`${rowIndex}-${colIndex}`];
            if (objectId) {
              const targetObject = populatedLayoutObjects.find(obj => obj.id === objectId);
              if (targetObject) {
                // Fix: The complex nested type from the API response can be inferred as `unknown[]`.
                // We map over it and explicitly check each element's type to ensure type safety.
                if (Array.isArray(deskStudents)) {
                  targetObject.students = deskStudents.map(s => (typeof s === 'string' ? s : null));
                }
              }
            }
          }
        });
      });
      setFinalArrangement(populatedLayoutObjects);
      setSeatingChart(result.seating);
    }

    setIsLoading(false);
  };

  const handlePrintClick = () => {
    const { jsPDF } = window.jspdf;
    const chartElement = chartRef.current;
  
    if (chartElement) {
      window.html2canvas(chartElement, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('zasedaci-poradek.pdf');
      });
    }
  };

  const MicIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
      <path d="M5.5 9.5a.5.5 0 01.5-.5h8a.5.5 0 010 1H6a.5.5 0 01-.5-.5z" />
      <path d="M3 9a2 2 0 012-2h1.5a.5.5 0 010 1H5a1 1 0 00-1 1v1a1 1 0 001 1h.5a.5.5 0 010 1H5a2 2 0 01-2-2V9z" />
      <path d="M17 9a2 2 0 00-2-2h-1.5a.5.5 0 000 1H15a1 1 0 011 1v1a1 1 0 01-1 1h-.5a.5.5 0 000 1H15a2 2 0 002-2V9z" />
      <path d="M10 15a4 4 0 01-4-4H4a5 5 0 005 5v2a1 1 0 102 0v-2a5 5 0 005-5h-2a4 4 0 01-4 4z" />
    </svg>
  );
  
  const isChartGenerated = finalArrangement !== null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Generátor zasedacího pořádku</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
       {isEditingLayout ? (
          <LayoutEditor 
            initialLayout={editorLayoutObjects}
            onSave={handleSaveLayout}
            onCancel={handleCancelEdit}
          />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Input Column */}
          <div className="flex flex-col gap-6">
            
            {/* Layout Section */}
            <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex flex-wrap gap-2 justify-between items-start mb-2">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Rozložení lavic</h2>
                        <p className="text-sm text-gray-600 mt-1">Náhled aktuálního rozložení. Pro úpravy vstupte do vizuálního editoru.</p>
                    </div>
                     <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        <button 
                            onClick={handleExportData}
                            className="px-3 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                        >
                            Exportovat data
                        </button>
                         <button 
                            onClick={() => importFileRef.current?.click()}
                            className="px-3 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                        >
                            Importovat data
                        </button>
                        <input type="file" ref={importFileRef} onChange={handleImportFileChange} accept=".json" className="hidden" />
                        <button 
                            onClick={() => setIsManageLayoutsModalOpen(true)}
                            className="px-4 py-2 bg-slate-600 text-white text-sm font-semibold rounded-md hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                        >
                            Načíst / Uložit
                        </button>
                        <button 
                            onClick={handleEnterEditMode} 
                            className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Upravit rozložení
                        </button>
                    </div>
                </div>

                {layoutObjects.length > 0 ? (
                    <LayoutPreview layoutObjects={layoutObjects} />
                ) : (
                     <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50 text-center text-gray-500">
                        Definujte rozložení ve vizuálním editoru.
                     </div>
                )}
            </div>

            {/* Students Section */}
            {!isChartGenerated && (
              <div className="bg-white p-6 rounded-lg shadow">
                <label htmlFor="student-list" className="block text-lg font-semibold text-gray-800 mb-2">Seznam žáků</label>
                <p className="text-sm text-gray-600 mb-3">Zadejte žáky, každý na nový řádek, nebo použijte diktování.</p>
                 <div className="relative">
                  <textarea
                    id="student-list"
                    className="w-full h-40 p-3 pr-10 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    value={students}
                    onChange={(e) => setStudents(e.target.value)}
                    placeholder="Novák Petr&#10;Svobodová Anna&#10;Dvořák Jan"
                  />
                  {hasRecognitionSupport && (
                    <button
                      type="button"
                      onClick={() => handleMicClick('students')}
                      disabled={isListening && dictationTarget !== 'students'}
                      className={`absolute top-2 right-2 p-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
                        ${isListening && dictationTarget === 'students'
                          ? 'bg-red-500 text-white animate-pulse ring-red-500'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 ring-blue-500'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      aria-label="Diktovat seznam žáků"
                    >
                      <MicIcon />
                    </button>
                  )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".txt,.csv" className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="mt-3 w-full sm:w-auto px-5 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500">
                  Načíst ze souboru (.txt, .csv)
                </button>
              </div>
            )}

            {/* Conditions Section */}
            <div className="bg-white p-6 rounded-lg shadow">
              <label htmlFor="conditions" className="block text-lg font-semibold text-gray-800 mb-2">
                {isChartGenerated ? 'Úpravy zasedacího pořádku (AI)' : 'Podmínky pro rozmístění (AI)'}
              </label>
              <p className="text-sm text-gray-600 mb-3">
                {isChartGenerated 
                  ? "Příklad: 'Vyměň Nováka Petra a Svobodovou Annu.' nebo 'Přesuň Dvořáka Jana do volné lavice.'" 
                  : "Příklad: 'Novák Petr a Svobodová Anna musí sedět v první lavici u okna (okna jsou vpravo). Zbytek náhodně.'"}
              </p>
              <div className="relative">
                <textarea
                  id="conditions"
                  className="w-full h-24 p-3 pr-10 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                />
                {hasRecognitionSupport && (
                  <button
                    type="button"
                    onClick={() => handleMicClick('conditions')}
                    disabled={isListening && dictationTarget !== 'conditions'}
                    className={`absolute top-2 right-2 p-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
                      ${isListening && dictationTarget === 'conditions'
                        ? 'bg-red-500 text-white animate-pulse ring-red-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 ring-blue-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label="Diktovat podmínky"
                  >
                    <MicIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Output Column */}
          <div className="flex flex-col gap-6">
            <div className="sticky top-8">
              <button 
                onClick={handleGenerateClick} 
                disabled={isLoading}
                className="w-full py-4 px-6 text-xl font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-transform transform hover:scale-105 disabled:bg-blue-300 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generuji...
                  </div>
                ) : (isChartGenerated ? 'Upravit zasedací pořádek' : 'Vygenerovat zasedací pořádek')}
              </button>
              
              {error && (
                <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg" role="alert">
                  <strong className="font-bold">Chyba!</strong>
                  <span className="block sm:inline ml-2">{error}</span>
                </div>
              )}

              <div className="mt-6">
                {isChartGenerated && finalArrangement && (
                  <div className="flex flex-col items-center gap-4">
                    <GeneratedChart ref={chartRef} arrangement={finalArrangement} />
                    <div className="flex flex-wrap justify-center gap-4 mt-4">
                        <button 
                          onClick={handlePrintClick}
                          className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Tisk zasedacího pořádku (PDF)
                        </button>
                        <button 
                          onClick={handleClearChart}
                          className="w-full sm:w-auto px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Zrušit zasedací pořádek
                        </button>
                    </div>
                  </div>
                )}
                {!isChartGenerated && !isLoading && (
                    <div className="mt-6 p-8 text-center border-2 border-dashed border-gray-300 rounded-lg bg-white">
                        <p className="text-gray-500">Zde se zobrazí vygenerovaný zasedací pořádek.</p>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </main>
      <ManageLayoutsModal
        isOpen={isManageLayoutsModalOpen}
        onClose={() => setIsManageLayoutsModalOpen(false)}
        currentLayout={layoutObjects}
        currentArrangement={finalArrangement}
        savedLayouts={savedLayouts}
        onSave={handleSaveLayoutToStorage}
        onLoad={handleLoadLayoutFromStorage}
        onDelete={handleDeleteLayoutFromStorage}
      />
    </div>
  );
};

export default App;