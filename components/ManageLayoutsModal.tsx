import React, { useState } from 'react';
import { LayoutObject, SavedClassroom } from '../types';

interface ManageLayoutsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentLayout: LayoutObject[];
    currentArrangement: LayoutObject[] | null;
    savedLayouts: SavedClassroom[];
    onSave: (name: string, layout: LayoutObject[], arrangement: LayoutObject[] | null) => void;
    onLoad: (layout: LayoutObject[], arrangement: LayoutObject[] | null) => void;
    onDelete: (name: string) => void;
}

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);


const ManageLayoutsModal: React.FC<ManageLayoutsModalProps> = ({
    isOpen,
    onClose,
    currentLayout,
    currentArrangement,
    savedLayouts,
    onSave,
    onLoad,
    onDelete
}) => {
    const [newLayoutName, setNewLayoutName] = useState('');

    if (!isOpen) {
        return null;
    }

    const handleSaveClick = () => {
        const trimmedName = newLayoutName.trim();
        if (trimmedName) {
            // Check for duplicate name
            if (savedLayouts.some(layout => layout.name === trimmedName)) {
                if (!window.confirm(`Rozložení s názvem "${trimmedName}" již existuje. Chcete jej přepsat?`)) {
                    return;
                }
            }
            onSave(trimmedName, currentLayout, currentArrangement);
            setNewLayoutName('');
        } else {
            alert('Zadejte prosím název rozložení.');
        }
    };

    const handleDeleteClick = (name: string) => {
        if (window.confirm(`Opravdu chcete smazat rozložení "${name}"?`)) {
            onDelete(name);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="layouts-modal-title">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b flex justify-between items-center">
                    <h2 id="layouts-modal-title" className="text-xl font-bold">Spravovat rozložení</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl leading-none" aria-label="Zavřít">&times;</button>
                </header>
                <div className="p-6 flex-grow overflow-y-auto">
                    {/* Save Section */}
                    <div className="mb-6 p-4 border rounded-md bg-slate-50">
                        <h3 className="font-semibold mb-2 text-gray-700">Uložit aktuální rozložení</h3>
                        <p className="text-xs text-gray-500 mb-2">Uloží se rozložení lavic a pokud existuje, tak i aktuální zasedací pořádek.</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={newLayoutName}
                                onChange={(e) => setNewLayoutName(e.target.value)}
                                placeholder="Např. 'Třída 3.B'"
                                className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                aria-label="Název nového rozložení"
                            />
                            <button
                                onClick={handleSaveClick}
                                className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                            >
                                Uložit
                            </button>
                        </div>
                    </div>

                    {/* Load Section */}
                    <div>
                        <h3 className="font-semibold mb-3 text-gray-700">Načíst uložené rozložení</h3>
                        {savedLayouts.length > 0 ? (
                            <ul className="space-y-2">
                                {savedLayouts.map((saved) => (
                                    <li key={saved.name} className="flex items-center justify-between p-3 bg-white border rounded-md hover:bg-gray-50">
                                        <div>
                                            <span className="font-medium text-gray-800">{saved.name}</span>
                                            {saved.arrangement && <span className="ml-2 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">obsahuje zasedací pořádek</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onLoad(saved.layout, saved.arrangement || null)}
                                                className="px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors"
                                            >
                                                Načíst
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(saved.name)}
                                                className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                                                aria-label={`Smazat ${saved.name}`}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 text-center py-4">Nemáte žádná uložená rozložení.</p>
                        )}
                    </div>
                </div>
                <footer className="p-4 bg-gray-50 border-t text-right">
                    <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300">
                        Zavřít
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ManageLayoutsModal;
