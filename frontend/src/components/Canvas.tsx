import { Stage, Layer, Rect, Ellipse, Text } from 'react-konva';

// Static placeholder shapes only — confirms react-konva renders correctly.
// No state management, sync, or AI wiring here yet (brief step 2).
export default function Canvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  return (
    <Stage width={width} height={height}>
      <Layer>
        <Rect x={120} y={120} width={200} height={120} fill="#38bdf8" stroke="#0369a1" strokeWidth={2} />
        <Ellipse x={500} y={220} radiusX={90} radiusY={60} fill="#facc15" stroke="#a16207" strokeWidth={2} />
        <Text x={120} y={300} text="Hello, whiteboard" fontSize={24} fill="#1f2937" />
      </Layer>
    </Stage>
  );
}
