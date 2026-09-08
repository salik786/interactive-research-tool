export function PrismaDiagram({
  identified,
  screened,
  duplicatesRemoved,
  fullTextAssessed,
  excludedFullText,
  included,
}: {
  identified: number;
  screened: number;
  duplicatesRemoved: number;
  fullTextAssessed: number;
  excludedFullText: number;
  included: number;
}) {
  const stages = [
    { label: "Records identified", value: identified },
    { label: "Records screened", value: screened },
    { label: "Full-text assessed", value: fullTextAssessed },
    { label: "Included in review", value: included },
  ];
  const sideLabels = [
    `${duplicatesRemoved} duplicates removed`,
    "excluded at title/abstract screening",
    `${excludedFullText} excluded at full-text`,
  ];

  const boxW = 320;
  const boxH = 64;
  const gap = 48;
  const totalH = stages.length * boxH + (stages.length - 1) * gap + 20;
  const cx = boxW / 2 + 10;

  return (
    <svg
      viewBox={`0 0 ${boxW + 260} ${totalH}`}
      className="h-auto w-full max-w-2xl"
      role="img"
      aria-label="PRISMA flow diagram"
    >
      <defs>
        <marker id="prisma-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" className="fill-text-secondary" />
        </marker>
      </defs>
      {stages.map((stage, i) => {
        const y = 10 + i * (boxH + gap);
        return (
          <g key={stage.label}>
            <rect
              x={10}
              y={y}
              width={boxW}
              height={boxH}
              rx={10}
              className="fill-surface stroke-border"
              strokeWidth={1.5}
            />
            <text
              x={cx}
              y={y + boxH / 2 - 6}
              textAnchor="middle"
              className="fill-text-primary font-sans text-[13px] font-medium"
            >
              {stage.label}
            </text>
            <text
              x={cx}
              y={y + boxH / 2 + 16}
              textAnchor="middle"
              className="fill-primary font-serif text-[20px] font-semibold"
            >
              {stage.value}
            </text>
            {i < stages.length - 1 && (
              <>
                <line
                  x1={cx}
                  y1={y + boxH}
                  x2={cx}
                  y2={y + boxH + gap}
                  className="stroke-text-secondary"
                  strokeWidth={1.5}
                  markerEnd="url(#prisma-arrow)"
                />
                <text
                  x={boxW + 30}
                  y={y + boxH + gap / 2 + 4}
                  className="fill-text-secondary font-sans text-[12px]"
                >
                  {sideLabels[i]}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
