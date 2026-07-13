import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback } from 'react';

interface CodePaneProps {
  code: string;
  onChange: (value: string) => void;
}

/**
 * Custom Monaco theme matching DESIGN.MD's token palette.
 * Background: surface-container-lowest (#0e0e0e)
 * Syntax colors drawn from the desaturated accent family.
 */
function defineGraphLoomTheme(monaco: Parameters<OnMount>[1]) {
  monaco.editor.defineTheme('graphloom-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'e5e2e1', background: '0e0e0e' },
      { token: 'comment', foreground: '8e9192', fontStyle: 'italic' },
      { token: 'keyword', foreground: '5C7C99' },           // Muted Blue (string/INPUT accent)
      { token: 'keyword.control', foreground: '5C7C99' },
      { token: 'storage', foreground: '5C7C99' },
      { token: 'storage.type', foreground: '5C7C99' },
      { token: 'type', foreground: '7D6B91' },               // Muted Purple (FETCH accent)
      { token: 'type.identifier', foreground: '7D6B91' },
      { token: 'string', foreground: '6B8E6D' },             // Muted Green (OUTPUT accent)
      { token: 'string.key.json', foreground: '5C7C99' },
      { token: 'number', foreground: 'B58B5C' },             // Muted Amber (TRANSFORM accent)
      { token: 'constant', foreground: 'B58B5C' },
      { token: 'regexp', foreground: 'A86565' },             // Desaturated red (boolean)
      { token: 'variable', foreground: 'e5e2e1' },
      { token: 'variable.predefined', foreground: 'c4c7c8' },
      { token: 'function', foreground: 'c8c6c5' },           // secondary
      { token: 'delimiter', foreground: '8e9192' },           // outline
      { token: 'delimiter.bracket', foreground: '8e9192' },
      { token: 'operator', foreground: 'c4c7c8' },           // on-surface-variant
      { token: 'tag', foreground: '5C7C99' },
      { token: 'attribute.name', foreground: '7D6B91' },
      { token: 'attribute.value', foreground: '6B8E6D' },
      { token: 'identifier', foreground: 'e5e2e1' },
    ],
    colors: {
      'editor.background': '#0e0e0e',
      'editor.foreground': '#e5e2e1',
      'editor.lineHighlightBackground': '#1c1b1b',
      'editor.selectionBackground': '#353534',
      'editor.inactiveSelectionBackground': '#2a2a2a',
      'editorCursor.foreground': '#fdfdfc',
      'editorWhitespace.foreground': '#353534',
      'editorLineNumber.foreground': '#444748',
      'editorLineNumber.activeForeground': '#8e9192',
      'editorIndentGuide.background': '#2a2a2a',
      'editorIndentGuide.activeBackground': '#444748',
      'editorWidget.background': '#1c1b1b',
      'editorWidget.border': '#444748',
      'editorBracketMatch.background': '#353534',
      'editorBracketMatch.border': '#444748',
      'editor.findMatchBackground': '#5C7C9944',
      'editor.findMatchHighlightBackground': '#5C7C9922',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': '#35353480',
      'scrollbarSlider.hoverBackground': '#44474880',
      'scrollbarSlider.activeBackground': '#8e919240',
    },
  });
}

export default function CodePane({ code, onChange }: CodePaneProps) {
  const handleEditorMount: OnMount = useCallback((_editor, monaco) => {
    defineGraphLoomTheme(monaco);
    monaco.editor.setTheme('graphloom-dark');
  }, []);

  return (
    <div className="code-pane-container">
      <div className="code-pane-header">
        <span className="code-pane-title">TypeScript</span>
        <span className="code-pane-badge">Live Sync</span>
      </div>
      <Editor
        height="calc(100% - 36px)"
        language="typescript"
        theme="vs-dark"
        value={code}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.5,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 12 },
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
