import Editor from '@monaco-editor/react';

interface CodePaneProps {
  code: string;
  onChange: (value: string) => void;
}

export default function CodePane({ code, onChange }: CodePaneProps) {
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
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 12 },
        }}
      />
    </div>
  );
}
