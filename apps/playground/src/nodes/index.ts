import InputNode from './InputNode';
import FetchNode from './FetchNode';
import TransformNode from './TransformNode';
import OutputNode from './OutputNode';

export const nodeTypes = {
  input: InputNode,
  fetch: FetchNode,
  transform: TransformNode,
  output: OutputNode,
};
