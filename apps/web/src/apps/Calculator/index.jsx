import { useState, useEffect } from 'react';
import useWindowStore from '../../os/store/windowStore';

// Calculator Component
function CalculatorComponent({ windowId }) {
  const [display, setDisplay] = useState('0');
  const [firstOperand, setFirstOperand] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecond, setWaitingForSecond] = useState(false);
  const [equation, setEquation] = useState('');

  const opSymbol = (op) => ({ '+': '+', '-': '−', '*': '×', '/': '÷' }[op] || op);

  const inputDigit = (digit) => {
    if (waitingForSecond) {
      setDisplay(digit);
      setWaitingForSecond(false);
      setEquation(equation + digit);
    } else {
      const newDisplay = display === '0' ? digit : display + digit;
      setDisplay(newDisplay);
      if (operator !== null) {
        setEquation(String(firstOperand) + ' ' + opSymbol(operator) + ' ' + newDisplay);
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const inputDecimal = () => {
    if (waitingForSecond) {
      setDisplay('0.');
      setWaitingForSecond(false);
      setEquation(equation + '0.');
      return;
    }
    if (!display.includes('.')) {
      const newDisplay = display + '.';
      setDisplay(newDisplay);
      if (operator !== null) {
        setEquation(String(firstOperand) + ' ' + opSymbol(operator) + ' ' + newDisplay);
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const clear = () => {
    setDisplay('0');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecond(false);
    setEquation('');
  };

  const handleBackspace = () => {
    if (waitingForSecond) return;
    const newDisplay = display.slice(0, -1) || '0';
    setDisplay(newDisplay);
    if (operator !== null) {
      setEquation(String(firstOperand) + ' ' + opSymbol(operator) + ' ' + (newDisplay === '0' ? '' : newDisplay));
    } else {
      setEquation(newDisplay === '0' ? '' : newDisplay);
    }
  };

  const performOperation = (nextOperator) => {
    const inputValue = parseFloat(display);

    if (firstOperand === null) {
      setFirstOperand(inputValue);
      setEquation(display + ' ' + opSymbol(nextOperator) + ' ');
    } else if (operator) {
      const result = calculate(firstOperand, inputValue, operator);
      setDisplay(String(result));
      setFirstOperand(result);
      setEquation(String(result) + ' ' + opSymbol(nextOperator) + ' ');
    }

    setWaitingForSecond(true);
    setOperator(nextOperator);
  };

  const calculate = (first, second, op) => {
    switch (op) {
      case '+': return first + second;
      case '-': return first - second;
      case '*': return first * second;
      case '/': return second !== 0 ? first / second : 'Error';
      default: return second;
    }
  };

  const handleEquals = () => {
    if (operator && firstOperand !== null) {
      const second = parseFloat(display);
      const result = calculate(firstOperand, second, operator);
      setEquation(String(firstOperand) + ' ' + opSymbol(operator) + ' ' + display + ' =');
      setDisplay(String(result));
      setFirstOperand(null);
      setOperator(null);
      setWaitingForSecond(false);
    }
  };

  const activeWindowId = useWindowStore((s) => s.activeWindowId);

  useEffect(() => {
    if (activeWindowId !== windowId) return;

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDecimal();
      } else if (e.key === '+') {
        performOperation('+');
      } else if (e.key === '-') {
        performOperation('-');
      } else if (e.key === '*') {
        performOperation('*');
      } else if (e.key === '/') {
        e.preventDefault();
        performOperation('/');
      } else if (e.key === 'Enter' || e.key === '=') {
        handleEquals();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        clear();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeWindowId, windowId, inputDigit, inputDecimal, performOperation, handleEquals, handleBackspace, clear]);

  const buttonStyle = {
    width: '40px',
    height: '28px',
    margin: '2px',
    border: '1px solid #888',
    borderRadius: '2px',
    background: 'linear-gradient(180deg, #fff 0%, #ece9d8 50%, #d4d0c8 100%)',
    cursor: 'pointer',
    fontFamily: 'Tahoma, sans-serif',
    fontSize: '12px',
  };

  const operatorStyle = {
    ...buttonStyle,
    background: 'linear-gradient(180deg, #e6e6fa 0%, #d0d0e8 50%, #b0b0c8 100%)',
  };

  return (
    <div style={{
      padding: '8px',
      background: '#ece9d8',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        width: '100%',
        height: '16px',
        marginBottom: '2px',
        textAlign: 'right',
        padding: '0 4px',
        fontFamily: 'Lucida Console, monospace',
        fontSize: '10px',
        color: '#666',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}>
        {equation}
      </div>
      <input
        type="text"
        value={display}
        readOnly
        style={{
          width: '100%',
          height: '24px',
          marginBottom: '8px',
          textAlign: 'right',
          padding: '2px 4px',
          fontFamily: 'Lucida Console, monospace',
          fontSize: '14px',
          border: '2px inset #888',
          background: '#fff',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button style={buttonStyle} onClick={clear}>C</button>
        <button style={buttonStyle} onClick={handleBackspace}>←</button>
        <button style={buttonStyle} disabled>%</button>
        <button style={operatorStyle} onClick={() => performOperation('/')}>÷</button>

        <button style={buttonStyle} onClick={() => inputDigit('7')}>7</button>
        <button style={buttonStyle} onClick={() => inputDigit('8')}>8</button>
        <button style={buttonStyle} onClick={() => inputDigit('9')}>9</button>
        <button style={operatorStyle} onClick={() => performOperation('*')}>×</button>

        <button style={buttonStyle} onClick={() => inputDigit('4')}>4</button>
        <button style={buttonStyle} onClick={() => inputDigit('5')}>5</button>
        <button style={buttonStyle} onClick={() => inputDigit('6')}>6</button>
        <button style={operatorStyle} onClick={() => performOperation('-')}>−</button>

        <button style={buttonStyle} onClick={() => inputDigit('1')}>1</button>
        <button style={buttonStyle} onClick={() => inputDigit('2')}>2</button>
        <button style={buttonStyle} onClick={() => inputDigit('3')}>3</button>
        <button style={operatorStyle} onClick={() => performOperation('+')}>+</button>

        <button style={{ ...buttonStyle, width: '86px' }} onClick={() => inputDigit('0')}>0</button>
        <button style={buttonStyle} onClick={inputDecimal}>.</button>
        <button style={{ ...operatorStyle, background: 'linear-gradient(180deg, #6699ff 0%, #3366cc 100%)', color: '#fff' }} onClick={handleEquals}>=</button>
      </div>
    </div>
  );
}

// Calculator icon
const calculatorIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="4" y="2" width="24" height="28" rx="2" fill="#4a5568" stroke="#2d3748" stroke-width="1"/>
    <rect x="6" y="4" width="20" height="6" fill="#a0e7a0"/>
    <rect x="6" y="12" width="5" height="4" fill="#fff"/>
    <rect x="13" y="12" width="5" height="4" fill="#fff"/>
    <rect x="20" y="12" width="5" height="4" fill="#e0e0e0"/>
    <rect x="6" y="18" width="5" height="4" fill="#fff"/>
    <rect x="13" y="18" width="5" height="4" fill="#fff"/>
    <rect x="20" y="18" width="5" height="4" fill="#e0e0e0"/>
    <rect x="6" y="24" width="5" height="4" fill="#fff"/>
    <rect x="13" y="24" width="5" height="4" fill="#fff"/>
    <rect x="20" y="24" width="5" height="4" fill="#6699ff"/>
  </svg>
`);

// App Configuration
const Calculator = {
  id: 'calculator',
  name: 'Calculator',
  icon: calculatorIcon,
  component: CalculatorComponent,
  defaultWindow: {
    width: 220,
    height: 280,
    resizable: false,
    minWidth: 220,
    minHeight: 280,
  },
  menuBar: {
    items: [
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', action: 'edit.copy' },
          { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', action: 'edit.paste' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { id: 'standard', label: 'Standard', action: 'view.standard' },
          { id: 'scientific', label: 'Scientific', action: 'view.scientific', disabled: true },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { id: 'about', label: 'About Calculator', action: 'help.about' },
        ],
      },
    ],
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Perform basic calculations',
  },
};

export default Calculator;
