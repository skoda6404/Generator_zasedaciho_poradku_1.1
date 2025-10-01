import React, { forwardRef, useRef, useLayoutEffect } from 'react';
import { LayoutObject } from '../types';

interface GeneratedChartProps {
  arrangement: LayoutObject[];
}

const PRINT_GRID_UNIT_SIZE = 12; // A slightly larger scale for better readability in the final print/PDF

/**
 * A component that displays a student's name, automatically handling
 * line breaks and font size adjustments to fit within its container.
 */
const StudentNameDisplay: React.FC<{ name: string }> = ({ name }) => {
    const nameRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const element = nameRef.current;
        // The padded container is the grandparent element
        if (!element || !element.parentElement?.parentElement) return;

        const container = element.parentElement.parentElement;
        
        // Use a timeout to ensure styles are applied and we can measure correctly.
        const timerId = setTimeout(() => {
            // Reset font size to default (from Tailwind's text-xs) to start measurement
            element.style.fontSize = '';
            element.style.lineHeight = '';

            const containerStyle = window.getComputedStyle(container);
            const availableWidth = container.clientWidth - parseFloat(containerStyle.paddingLeft) - parseFloat(containerStyle.paddingRight);
            const availableHeight = container.clientHeight - parseFloat(containerStyle.paddingTop) - parseFloat(containerStyle.paddingBottom);

            let currentFontSize = parseFloat(window.getComputedStyle(element).fontSize);

            // Iteratively reduce font size until it fits.
            // scrollWidth/Height includes the content that's not visible.
            while (
                (element.scrollWidth > availableWidth || element.scrollHeight > availableHeight) &&
                currentFontSize > 7 // Set a minimum font size of 7px
            ) {
                currentFontSize -= 0.5;
                element.style.fontSize = `${currentFontSize}px`;
                // Also adjust line-height for wrapped text to prevent overlap.
                element.style.lineHeight = `${currentFontSize * 1.1}px`; 
            }
        }, 0);

        return () => clearTimeout(timerId);
    }, [name]);

    const nameParts = name.split(' ');
    // Wrap name between first and last name
    const formattedName = nameParts.length > 1
        ? <>{nameParts[0]}<br />{nameParts.slice(1).join(' ')}</>
        : name;

    return <div ref={nameRef}>{formattedName}</div>;
};


const GeneratedChart = forwardRef<HTMLDivElement, GeneratedChartProps>(({ arrangement }, ref) => {
  if (!arrangement || arrangement.length === 0) {
    return null;
  }

  // Calculate the bounding box to determine the size of the container
  let totalWidth = 0;
  let totalHeight = 0;
  arrangement.forEach(desk => {
      totalWidth = Math.max(totalWidth, desk.x + desk.width);
      totalHeight = Math.max(totalHeight, desk.y + desk.height);
  });

  // Add a little padding to the container
  totalWidth += 2;
  totalHeight += 2;
  
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${totalWidth * PRINT_GRID_UNIT_SIZE}px`,
    height: `${totalHeight * PRINT_GRID_UNIT_SIZE}px`,
  };

  const renderDeskWithStudents = (desk: LayoutObject) => {
    const { type, students = [], rotation = 0 } = desk;
    const isRotated = rotation === 90;

    const baseDeskClasses = `bg-blue-50 border-2 border-blue-300 rounded-md flex w-full h-full ${isRotated ? 'flex-col' : ''}`;
    const seatUnavailableClasses = "bg-slate-200";
    const seatBaseClasses = "h-full flex items-center justify-center p-1 text-center text-xs font-semibold text-gray-800 break-words";
    
    // Multi-seat desks e.g. '1', '11', '101', '00'
    if (/^[01]+$/.test(type)) {
      const seats = type.split('');
      const numSeats = seats.length;
      return (
        <div className={baseDeskClasses}>
          {seats.map((seat, index) => {
            const isUnavailable = type.includes('1') && seat === '0';
            const studentName = students[index] || '';
            const dividerClass = isRotated
                ? (index < numSeats - 1 ? 'border-b border-blue-300' : '')
                : (index < numSeats - 1 ? 'border-r border-blue-300' : '');
            const style = isRotated
                ? { height: `${100 / numSeats}%` }
                : { width: `${100 / numSeats}%` };
            
            return (
              <div
                key={index}
                className={`
                  ${seatBaseClasses}
                  ${isUnavailable ? seatUnavailableClasses : ''}
                  ${dividerClass}
                `}
                style={style}
              >
                <div className={`transform ${isRotated ? 'rotate-90' : ''}`}>
                    {!isUnavailable && studentName ? <StudentNameDisplay name={studentName} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    
    return <div className="w-full h-full"></div>;
  }

  return (
    <div ref={ref} className="p-8 bg-white rounded-lg shadow-lg overflow-auto">
        <div style={containerStyle}>
            {arrangement.map((desk) => (
              <div
                key={desk.id}
                className="absolute"
                style={{
                  left: `${desk.x * PRINT_GRID_UNIT_SIZE}px`,
                  top: `${desk.y * PRINT_GRID_UNIT_SIZE}px`,
                  width: `${desk.width * PRINT_GRID_UNIT_SIZE}px`,
                  height: `${desk.height * PRINT_GRID_UNIT_SIZE}px`,
                }}
              >
                {renderDeskWithStudents(desk)}
              </div>
            ))}
        </div>
        <div className="mt-8 text-center text-lg font-medium text-gray-700" style={{position: 'relative'}}>
            Tabule / Katedra
        </div>
    </div>
  );
});

export default GeneratedChart;