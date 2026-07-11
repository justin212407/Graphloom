import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import DiffView from '../src/DiffView';

describe('DiffView component', () => {
  it('renders "No visible differences" when graphText and codeText are identical after trim', () => {
    const graphText = '  const a = 1;\n ';
    const codeText = 'const a = 1;';
    
    const html = renderToString(React.createElement(DiffView, { graphText, codeText }));
    
    expect(html).toContain('No visible differences');
    expect(html).not.toContain('Proposed');
  });

  it('renders additions and removals for differences', () => {
    const graphText = 'const a = 1;\nconst b = 2;';
    const codeText = 'const a = 1;\nconst b = 3;'; // b changed from 2 to 3
    
    const html = renderToString(React.createElement(DiffView, { graphText, codeText }));
    
    expect(html).toContain('Graph Side');
    expect(html).toContain('Code Side');
    // Proposed side shows old text removed (- const b = 2)
    expect(html).toContain('- </span>const b = 2');
    // Hand-edited side shows new text added (+ const b = 3)
    expect(html).toContain('+ </span>const b = 3');
  });

  it('handles empty input gracefully', () => {
    const html = renderToString(React.createElement(DiffView, { graphText: '', codeText: '' }));
    expect(html).toContain('No visible differences');
  });

  it('renders truncation indicators/expand buttons for large text diffs', () => {
    const graphText = Array(10).fill('const line = 1;').join('\n');
    const codeText = Array(10).fill('const line = 2;').join('\n');
    
    const html = renderToString(React.createElement(DiffView, { graphText, codeText }));
    
    // Large text differences should trigger the View Full Diff button and truncated class
    expect(html).toContain('View Full Diff');
    expect(html).toContain('diff-truncated');
  });
});
