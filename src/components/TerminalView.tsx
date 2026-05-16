import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import 'xterm/css/xterm.css';

const TerminalView = ({ sessionId, terminalId }: { sessionId: string, terminalId: string }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: parseInt(localStorage.getItem('omni-terminal-font-size') || '14'),
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#10b981',
        selectionBackground: 'rgba(16, 185, 129, 0.3)',
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    setTimeout(() => {
      fitAddon.fit();
      
      // Start PTY Session with correct dimensions only ONCE
      if (!openedRef.current) {
        openedRef.current = true;
        invoke('open_terminal', { 
          sessionId, 
          terminalId,
          cols: term.cols || 80,
          rows: term.rows || 24
        }).catch(e => {
          term.writeln(`\x1b[31mFailed to open terminal: ${e}\x1b[0m`);
        });
      }
    }, 50);

    xtermRef.current = term;

    // Handle Input
    const onDataDisposable = term.onData((data) => {
      invoke('write_terminal_data', { 
        terminalId, 
        data: Array.from(new TextEncoder().encode(data)) 
      }).catch(console.error);
    });

    // Handle Resize
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      invoke('resize_terminal', { terminalId, cols, rows }).catch(console.error);
    });

    // Handle Output with proper async cleanup for StrictMode
    const unlistenPromise = listen(`terminal-output-${terminalId}`, (event: any) => {
      const data = new Uint8Array(event.payload);
      term.write(data);
    });

    // Resize Observer for accurate container resizing
    const resizeObserver = new ResizeObserver(() => {
      if (xtermRef.current) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(terminalRef.current);
    
    // Handle Settings Change
    const handleSettingsChange = () => {
      const newSize = parseInt(localStorage.getItem('omni-terminal-font-size') || '14');
      if (term.options.fontSize !== newSize) {
        term.options.fontSize = newSize;
        fitAddon.fit();
      }
    };
    window.addEventListener('omni-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('omni-settings-changed', handleSettingsChange);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      unlistenPromise.then(unlisten => unlisten());
      term.dispose();
      invoke('close_terminal', { terminalId }).catch(console.error);
    };
  }, [sessionId, terminalId]);

  return (
    <div className="h-full w-full bg-[#09090b] p-2 pr-2 pb-0">
      <div 
        ref={terminalRef} 
        className="h-full w-full overflow-hidden select-text" 
      />
    </div>
  );
};

export default TerminalView;