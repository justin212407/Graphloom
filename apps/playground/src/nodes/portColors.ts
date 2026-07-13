/**
 * Port dot colors mapped by PortType (data type), not node kind.
 * Per DESIGN.MD:
 *   String  → Muted Blue    #5C7C99
 *   Number  → Muted Amber   #B58B5C
 *   Object  → Muted Purple  #7D6B91
 *   Boolean → Desaturated Red #A86565
 *   Array   → Desaturated Teal #5C8C85
 */
export function portTypeColor(type: string): string {
  switch (type) {
    case 'string': return '#5C7C99';
    case 'number': return '#B58B5C';
    case 'array': return '#5C8C85';
    case 'object': return '#7D6B91';
    case 'boolean': return '#A86565';
    default: return '#8e9192';
  }
}
