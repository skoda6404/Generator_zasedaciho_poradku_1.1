import React, { useState, useRef, useCallback } from 'react';
import { renderDesk } from './LayoutPreview';
import { Desk, LayoutObject } from '../types';

const GRID_SIZE = 16; // The size of one grid cell in pixels
const DESK_WIDTH_UNITS = 8; // Desk width in grid units (128px)
export const DESK_HEIGHT_UNITS = 4; // Desk height in grid units (64px)

interface LayoutEditorProps {
  initialLayout: LayoutObject[];
  onSave: (layout: LayoutObject[]) => void;
  onCancel: () => void;
}

const PALETTE_DESKS = [
    { type: '1', name: 'Jednolavice', width: DESK_WIDTH_UNITS / 2, height: DESK_HEIGHT_UNITS },
    { type: '11', name: 'Dvojlavice', width: DESK_WIDTH_UNITS, height: DESK_HEIGHT_UNITS },
    { type: '111', name: 'Trojlavice', width: DESK_WIDTH_UNITS + (DESK_WIDTH_UNITS/2), height: DESK_HEIGHT_UNITS },
    { type: '101', name: 'Trojlavice (blok.)', width: DESK_WIDTH_UNITS + (DESK_WIDTH_UNITS/2), height: DESK_HEIGHT_UNITS },
];

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const RotateIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6"/>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    </svg>
);


const LayoutEditor: React.FC<LayoutEditorProps> = ({ initialLayout, onSave, onCancel }) => {
    const [layoutObjects, setLayoutObjects] = useState<LayoutObject[]>(initialLayout);
    const editorRef = useRef<HTMLDivElement>(null);
    const dragData = useRef<{type: string, width: number, height: number, isNew: boolean, id?: string, offsetX?: number, offsetY?: number} | null>(null);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, desk: { type: string, width: number, height: number, isNew: boolean, id?: string }) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        dragData.current = { ...desk, offsetX, offsetY };
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const checkCollision = (newDesk: LayoutObject, existingDesks: LayoutObject[]): boolean => {
        for (const desk of existingDesks) {
            if (desk.id === newDesk.id) continue;
            if (
                newDesk.x < desk.x + desk.width &&
                newDesk.x + newDesk.width > desk.x &&
                newDesk.y < desk.y + desk.height &&
                newDesk.y + newDesk.height > desk.y
            ) {
                return true; // Collision detected
            }
        }
        return false;
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!dragData.current || !editorRef.current) return;

        const editorRect = editorRef.current.getBoundingClientRect();
        const x = e.clientX - editorRect.left - (dragData.current.isNew ? dragData.current.width * GRID_SIZE / 2 : (dragData.current.offsetX || 0));
        const y = e.clientY - editorRect.top - (dragData.current.isNew ? dragData.current.height * GRID_SIZE / 2 : (dragData.current.offsetY || 0));

        const gridX = Math.round(x / GRID_SIZE);
        const gridY = Math.round(y / GRID_SIZE);

        const newDesk: LayoutObject = {
            id: dragData.current.id || `desk-${Date.now()}`,
            type: dragData.current.type,
            x: gridX,
            y: gridY,
            width: dragData.current.width,
            height: dragData.current.height,
            rotation: 0,
            userBlockedSeats: [],
        };
        
        const otherDesks = layoutObjects.filter(d => d.id !== newDesk.id);
        if (checkCollision(newDesk, otherDesks)) {
            // Handle collision - maybe show an error, for now we just don't place it
            console.warn("Collision detected!");
            return;
        }

        if (dragData.current.isNew) {
            setLayoutObjects(prev => [...prev, newDesk]);
        } else {
            // Preserve rotation and blocked seats when moving an existing desk
            const existingDesk = layoutObjects.find(d => d.id === newDesk.id);
            if (existingDesk) {
                newDesk.rotation = existingDesk.rotation;
                newDesk.width = existingDesk.width;
                newDesk.height = existingDesk.height;
                newDesk.userBlockedSeats = existingDesk.userBlockedSeats;
            }
            setLayoutObjects(prev => prev.map(d => d.id === newDesk.id ? newDesk : d));
        }

        dragData.current = null;
    };

    const removeDesk = (id: string) => {
        setLayoutObjects(prev => prev.filter(d => d.id !== id));
    };

    const handleRotateDesk = (id: string) => {
        setLayoutObjects(prev =>
            prev.map(desk => {
                if (desk.id === id) {
                    // Swap width and height, and toggle rotation
                    return {
                        ...desk,
                        width: desk.height,
                        height: desk.width,
                        rotation: (desk.rotation || 0) === 0 ? 90 : 0,
                    };
                }
                return desk;
            })
        );
    };

    const handleSeatClick = (deskId: string, seatIndex: number) => {
        setLayoutObjects(prev =>
            prev.map(d => {
                if (d.id === deskId) {
                    const currentBlocked = d.userBlockedSeats || [];
                    const isBlocked = currentBlocked.includes(seatIndex);
                    const newBlocked = isBlocked
                        ? currentBlocked.filter(i => i !== seatIndex)
                        : [...currentBlocked, seatIndex];
                    return { ...d, userBlockedSeats: newBlocked };
                }
                return d;
            })
        );
    };

    // Sort desks for logical numbering: front-to-back (Y desc), left-to-right (X asc)
    const sortedLayoutObjects = [...layoutObjects].sort((a, b) => {
        const yDifference = a.y - b.y;
        // A tolerance to group desks that are roughly in the same row.
        if (Math.abs(yDifference) > DESK_HEIGHT_UNITS / 2) {
            return b.y - a.y; // Primary sort: Y descending (front row has higher Y)
        }
        return a.x - b.x; // Secondary sort: X ascending (left to right)
    });

    const PALETTE_WIDTH_UNIT_REM = 0.75; // 1 editor width unit = 0.75rem. A standard desk (8 units) is 6rem (w-24).
    const PALETTE_HEIGHT_REM = 3.5; // Corresponds to Tailwind's h-14.

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-3/4">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Vizuální Editor Rozložení</h2>
                 <p className="text-sm text-gray-600 mb-4">Kliknutím na místo v lavici ho můžete zablokovat/odblokovat.</p>
                <div
                    ref={editorRef}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="relative w-full bg-white rounded-lg shadow-lg border"
                    style={{ 
                        height: '70vh', 
                        backgroundImage: `
                            linear-gradient(to right, #e2e8f0 1px, transparent 1px),
                            linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
                        `,
                        backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                    }}
                >
                    {sortedLayoutObjects.map((desk, index) => (
                        <div
                            key={desk.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, { ...desk, isNew: false })}
                            className="absolute group cursor-move bg-white p-1 rounded-lg shadow-md hover:shadow-xl transition-shadow border-2 border-transparent hover:border-blue-500"
                            style={{
                                left: `${desk.x * GRID_SIZE}px`,
                                top: `${desk.y * GRID_SIZE}px`,
                                width: `${desk.width * GRID_SIZE}px`,
                                height: `${desk.height * GRID_SIZE}px`,
                            }}
                        >
                            <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full z-10">
                                {index + 1}
                            </div>
                            <button onClick={() => handleRotateDesk(desk.id)} className="absolute top-1 left-1 bg-slate-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-slate-600">
                                <RotateIcon />
                            </button>
                            <button onClick={() => removeDesk(desk.id)} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600">
                                <TrashIcon />
                            </button>
                            {renderDesk(desk.type, desk.id, false, desk.rotation, desk.userBlockedSeats || [], (seatIndex) => handleSeatClick(desk.id, seatIndex))}
                        </div>
                    ))}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 mt-4 text-center text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded z-0">
                        Tabule / Katedra
                    </div>
                </div>
            </div>
            <div className="lg:w-1/4">
                <div className="sticky top-8 bg-white p-4 rounded-lg shadow">
                    <h3 className="font-semibold mb-4 text-gray-700">Paleta lavic</h3>
                    <p className="text-xs text-gray-500 mb-4">Přetáhněte lavici na plochu vlevo.</p>
                    <div className="space-y-4">
                        {PALETTE_DESKS.map(desk => {
                            const paletteWidth = desk.width * PALETTE_WIDTH_UNIT_REM;
                            return (
                                <div key={desk.type}>
                                    <div className="text-sm font-medium text-gray-600 mb-1">{desk.name}</div>
                                    <div
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, { ...desk, isNew: true })}
                                        className="cursor-grab p-1 border border-dashed rounded-md hover:bg-slate-100"
                                        style={{ 
                                            width: `${paletteWidth}rem`, 
                                            height: `${PALETTE_HEIGHT_REM}rem` 
                                        }}
                                    >
                                        {renderDesk(desk.type, desk.type, true)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                     <div className="mt-8 pt-4 border-t">
                        <button onClick={() => onSave(layoutObjects)} className="w-full px-5 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                            Uložit a použít
                        </button>
                        <button onClick={onCancel} className="w-full mt-3 px-5 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400">
                            Zrušit
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LayoutEditor;


// Utility functions
export const parseLayoutMatrixToObjects = (matrix: string): LayoutObject[] => {
    const objects: LayoutObject[] = [];
    const rows = matrix.trim().split('\n');
    let idCounter = 0;
    
    rows.forEach((row, rowIndex) => {
        row.split(',').forEach((deskType, colIndex) => {
            const trimmedDesk = deskType.trim();
            if (trimmedDesk && trimmedDesk !== '--') {
                const deskConfig = PALETTE_DESKS.find(d => d.type === trimmedDesk) || {
                    width: DESK_WIDTH_UNITS,
                    height: DESK_HEIGHT_UNITS
                };
                
                objects.push({
                    id: `desk-initial-${idCounter++}`,
                    type: trimmedDesk,
                    x: colIndex * (DESK_WIDTH_UNITS + 2), // Add some spacing
                    y: rowIndex * (DESK_HEIGHT_UNITS + 2), // Y is now top-down
                    width: deskConfig.width,
                    height: deskConfig.height,
                    rotation: 0,
                    userBlockedSeats: [],
                });
            }
        });
    });
    return objects;
};

export const convertObjectsToLayoutMatrix = (objects: LayoutObject[]): { matrix: string, layout: Desk[][], positionMap: { [key: string]: string }, numberedMatrix: string } => {
    const positionMap: { [key: string]: string } = {};
    if (objects.length === 0) {
        return { matrix: '', layout: [], positionMap, numberedMatrix: '' };
    }

    // A. Create a desk-to-number mapping based on the UI sorting logic (front-to-back)
    const uiSortedObjects = [...objects].sort((a, b) => {
        const yDifference = a.y - b.y;
        if (Math.abs(yDifference) > DESK_HEIGHT_UNITS / 2) {
            return b.y - a.y; // Y descending (front row has higher Y)
        }
        return a.x - b.x; // X ascending (left to right)
    });
    const deskNumberMap = new Map<string, number>();
    uiSortedObjects.forEach((desk, index) => {
        deskNumberMap.set(desk.id, index + 1);
    });

    // 1. Group desks into rows based on Y-coordinate proximity (for matrix generation, back-to-front).
    const sortedByY = [...objects].sort((a, b) => a.y - b.y);
    const rows: LayoutObject[][] = [];
    if (sortedByY.length > 0) {
        let currentRow: LayoutObject[] = [sortedByY[0]];
        for (let i = 1; i < sortedByY.length; i++) {
            const currentDesk = sortedByY[i];
            const firstDeskInRow = currentRow[0];
            if (Math.abs((currentDesk.y + currentDesk.height / 2) - (firstDeskInRow.y + firstDeskInRow.height / 2)) < DESK_HEIGHT_UNITS) {
                currentRow.push(currentDesk);
            } else {
                rows.push(currentRow.sort((a, b) => a.x - b.x));
                currentRow = [currentDesk];
            }
        }
        rows.push(currentRow.sort((a, b) => a.x - b.x));
    }

    if (rows.length === 0) {
        return { matrix: '', layout: [], positionMap, numberedMatrix: '' };
    }

    // 2. Define global column positions.
    const allDeskCenters = objects.map(d => d.x + d.width / 2);
    const sortedUniqueCenters = [...new Set(allDeskCenters)].sort((a, b) => a - b);
    
    const columnCenters: number[] = [];
    if (sortedUniqueCenters.length > 0) {
        let currentCluster = [sortedUniqueCenters[0]];
        for (let i = 1; i < sortedUniqueCenters.length; i++) {
            if (sortedUniqueCenters[i] - currentCluster[currentCluster.length - 1] < (DESK_WIDTH_UNITS / 2)) {
                currentCluster.push(sortedUniqueCenters[i]);
            } else {
                const clusterCenter = currentCluster.reduce((sum, val) => sum + val, 0) / currentCluster.length;
                columnCenters.push(clusterCenter);
                currentCluster = [sortedUniqueCenters[i]];
            }
        }
        const clusterCenter = currentCluster.reduce((sum, val) => sum + val, 0) / currentCluster.length;
        columnCenters.push(clusterCenter);
    }
    
    const numCols = columnCenters.length > 0 ? columnCenters.length : 1;

    // 3. Build the layout matrix grid.
    const layoutGrid: Desk[][] = rows.map((row, rowIndex) => {
        const newRow: Desk[] = Array(numCols).fill('--');
        
        row.forEach(desk => {
            const deskCenter = desk.x + desk.width / 2;
            let bestColIndex = -1;
            let minDistance = Infinity;
            
            columnCenters.forEach((center, index) => {
                const distance = Math.abs(deskCenter - center);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestColIndex = index;
                }
            });

            if (bestColIndex !== -1 && (newRow[bestColIndex] === '--' || newRow[bestColIndex] === undefined)) {
                newRow[bestColIndex] = desk.type;
                positionMap[`${rowIndex}-${bestColIndex}`] = desk.id;
            } else if (bestColIndex !== -1) {
                let placed = false;
                for (let i = 0; i < numCols; i++) {
                    if (newRow[i] === '--' || newRow[i] === undefined) {
                        newRow[i] = desk.type;
                        positionMap[`${rowIndex}-${i}`] = desk.id;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    const newIndex = newRow.length;
                    newRow.push(desk.type);
                    positionMap[`${rowIndex}-${newIndex}`] = desk.id;
                }
            }
        });
        
        return newRow;
    });

    // Ensure all rows have the same length
    const maxRowLength = layoutGrid.reduce((max, row) => Math.max(max, row.length), 0);
    const finalLayoutGrid = layoutGrid.map(row => {
        while (row.length < maxRowLength) {
            row.push('--');
        }
        return row;
    });

    const matrix = finalLayoutGrid.map(row => row.join(',')).join('\n');
    
    // B. Create the numbered matrix for AI reference
    const numberedGrid: string[][] = finalLayoutGrid.map(row => new Array(row.length).fill('--'));
    finalLayoutGrid.forEach((row, rowIndex) => {
        row.forEach((deskType, colIndex) => {
            if (deskType !== '--') {
                const deskId = positionMap[`${rowIndex}-${colIndex}`];
                if (deskId) {
                    const deskNumber = deskNumberMap.get(deskId);
                    if (deskNumber !== undefined) {
                        numberedGrid[rowIndex][colIndex] = `L${deskNumber}`;
                    }
                }
            }
        });
    });
    
    // The numbered matrix must have the same orientation as the main layout matrix (back row first)
    // to provide a consistent reference for the AI.
    const numberedMatrix = numberedGrid.map(row => row.map(cell => cell.padEnd(5)).join(',')).join('\n');


    return { matrix, layout: finalLayoutGrid, positionMap, numberedMatrix };
};