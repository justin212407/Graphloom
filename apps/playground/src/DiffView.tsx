import { useState } from 'react';
import { diffLines } from 'diff';

interface DiffViewProps {
  graphText: string;
  codeText: string;
}

export default function DiffView({ graphText, codeText }: DiffViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const cleanGraph = (graphText ?? '').trim();
  const cleanCode = (codeText ?? '').trim();

  if (cleanGraph === cleanCode) {
    return (
      <div className="diff-no-difference">
        <span>No visible differences (formatting or whitespace changes only)</span>
      </div>
    );
  }

  // Generate line diff. codeText is the hand-edited code (current/old) vs graphText (new generated)
  // Let's show codeText (what developer wrote) as modified/new or old.
  // Standard git diff shows:
  //   - old (graph/generated/expected)
  //   - new (developer/current edited)
  // Or vice versa:
  //   - old (original baseline)
  //   - new code vs new graph.
  // Let's treat graphText (what the graph side wants) as red/removed or green/added depending on perspective.
  // Actually, standard is to show:
  //   red/minus (-) for graph-side code (if they want code-side)
  //   green/plus (+) for code-side code
  // Let's pass old = graphText, new = codeText.
  const changes = diffLines(cleanGraph, cleanCode);

  // Check size of the text to see if it needs truncation
  const lineCount = cleanCode.split('\n').length + cleanGraph.split('\n').length;
  const isLarge = lineCount > 6 || cleanCode.length > 250 || cleanGraph.length > 250;
  const showTruncated = isLarge && !isExpanded;

  return (
    <div className="diff-view-container">
      <div className="diff-view-header">
        <span className="diff-title-graph">Graph Side (Proposed)</span>
        <span className="diff-vs">vs</span>
        <span className="diff-title-code">Code Side (Monaco Hand-Edit)</span>
      </div>
      <div className={`diff-lines ${showTruncated ? 'diff-truncated' : ''}`}>
        {changes.map((part, index) => {
          const colorClass = part.added
            ? 'diff-added'
            : part.removed
            ? 'diff-removed'
            : 'diff-unchanged';
          const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
          
          return (
            <div key={index} className={`diff-line-group ${colorClass}`}>
              {part.value.split('\n').map((line, lineIndex) => {
                // If it's the last element of split and empty, it's just trailing newline
                if (lineIndex === part.value.split('\n').length - 1 && line === '') {
                  return null;
                }
                return (
                  <pre key={lineIndex} className="diff-line-content">
                    <span className="diff-prefix">{prefix}</span>
                    {line}
                  </pre>
                );
              })}
            </div>
          );
        })}
      </div>
      {isLarge && (
        <button
          className="diff-expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Collapse Diff' : 'View Full Diff'}
        </button>
      )}
    </div>
  );
}
