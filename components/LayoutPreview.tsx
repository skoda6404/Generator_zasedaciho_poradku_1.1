import React from 'react';
import { LayoutObject } from '../types';

interface LayoutPreviewProps {
  layoutObjects: LayoutObject[];
}

const PREVIEW_GRID_UNIT_SIZE = 10; // 1 unit in the editor = 10px in the preview
const DESK_HEIGHT_UNITS = 4; // Standard desk height in grid units, used for row detection

export const renderDesk = (
    type: string,
    key?: React.Key,
    isPreview = true, // isPreview distinguishes palette from editor canvas. Now it is only used for small details.
    rotation: number = 0,
    userBlockedSeats: number[] = [],
    onSeatClick?: (seatIndex: number) => void
) => {
    // Both in the editor canvas and in the palette, the desk component
    // should fill its parent container. The parent container is responsible for sizing.
    const containerSize = "w-full h-full";
    const isRotated = rotation === 90;

    if (type === '--') {
        // An empty space has no visual representation.
        return <div key={key}></div>;
    }

    const baseDeskClasses = `bg-slate-200 border-2 border-slate-400 rounded-md flex ${containerSize} ${isRotated ? 'flex-col' : ''}`;
    const seatUnavailableClasses = "bg-slate-300";
    const seatUserBlockedClasses = "bg-slate-500";
    const seatBaseClasses = "h-full";

    // Multi-seat desks e.g. '1', '11', '101', '00'
    if (/^[01]+$/.test(type)) {
        const seats = type.split('');
        const numSeats = seats.length;
        const hasOnes = type.includes('1');

        return (
            <div key={key} className={baseDeskClasses}>
                {seats.map((seat, index) => {
                    const isPermanentlyBlocked = hasOnes && seat === '0';
                    const isUserBlocked = userBlockedSeats.includes(index);
                    const isClickable = onSeatClick && !isPermanentlyBlocked;

                    const dividerClass = isRotated
                        ? (index < numSeats - 1 ? 'border-b border-slate-400' : '')
                        : (index < numSeats - 1 ? 'border-r border-slate-400' : '');
                    const style = isRotated
                        ? { height: `${100 / numSeats}%` }
                        : { width: `${100 / numSeats}%` };

                    return (<div
                        key={index}
                        onClick={() => isClickable && onSeatClick(index)}
                        className={`
                            ${seatBaseClasses}
                            ${isPermanentlyBlocked ? seatUnavailableClasses : ''}
                            ${isUserBlocked ? seatUserBlockedClasses : ''}
                            ${isClickable ? 'cursor-pointer hover:bg-slate-100 transition-colors' : ''}
                            ${dividerClass}
                        `}
                        style={style}
                    ></div>)
                })}
            </div>
        );
    }
    
    // Fallback for unknown desk types
    return <div key={key}></div>;
};


const LayoutPreview: React.FC<LayoutPreviewProps> = ({ layoutObjects }) => {
  if (!layoutObjects || layoutObjects.length === 0) {
    return null;
  }

  // Sort desks for logical numbering: front-to-back (Y desc), left-to-right (X asc)
  const sortedLayoutObjects = [...layoutObjects].sort((a, b) => {
    const yDifference = a.y - b.y;
    // A tolerance to group desks that are roughly in the same row.
    if (Math.abs(yDifference) > DESK_HEIGHT_UNITS / 2) {
        return b.y - a.y; // Primary sort: Y descending (front row has higher Y)
    }
    return a.x - b.x; // Secondary sort: X ascending (left to right)
  });

  // Calculate the bounding box to determine the size of the container
  let totalWidth = 0;
  let totalHeight = 0;
  layoutObjects.forEach(desk => {
      totalWidth = Math.max(totalWidth, desk.x + desk.width);
      totalHeight = Math.max(totalHeight, desk.y + desk.height);
  });

  // Add a little padding to the container
  totalWidth += 2;
  totalHeight += 2;

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${totalWidth * PREVIEW_GRID_UNIT_SIZE}px`,
    height: `${totalHeight * PREVIEW_GRID_UNIT_SIZE}px`,
    minWidth: '100%', // Ensure container fills the space
  };


  return (
    <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-lg bg-white relative overflow-x-auto">
      <div style={containerStyle}>
        {sortedLayoutObjects.map((desk, index) => (
          <div
            key={desk.id}
            className="absolute"
            style={{
              left: `${desk.x * PREVIEW_GRID_UNIT_SIZE}px`,
              top: `${desk.y * PREVIEW_GRID_UNIT_SIZE}px`,
              width: `${desk.width * PREVIEW_GRID_UNIT_SIZE}px`,
              height: `${desk.height * PREVIEW_GRID_UNIT_SIZE}px`,
            }}
          >
            <div className="absolute -top-1.5 -left-1.5 bg-slate-600 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full z-10 shadow">
                {index + 1}
            </div>
            {/* Call renderDesk with isPreview=false to make it fill the container */}
            {renderDesk(desk.type, desk.id, false, desk.rotation, desk.userBlockedSeats)}
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 mt-4 text-center text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded">
        Tabule / Katedra
      </div>
    </div>
  );
};

export default LayoutPreview;