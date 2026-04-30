import { QRCodeCanvas } from "qrcode.react";

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const safePositive = (value, fallback = 8, min = 0) => Math.max(min, safeNumber(value, fallback));
const elementKey = (element, index) => element?.id || `${element?.type || "element"}_${index}`;

const textStyle = (element) => ({
  left: safeNumber(element.x, 0),
  top: safeNumber(element.y, 0),
  width: safePositive(element.width, 120, 0),
  height: safePositive(element.height, 24, 0),
  fontSize: safePositive(element.fontSize, 14, 1),
  fontFamily: element.fontFamily || "Arial",
  fontWeight: element.fontWeight || "normal",
  color: element.color || "#111827",
  textAlign: element.align || "left",
  backgroundColor:
    element.backgroundColor && element.backgroundColor !== "transparent"
      ? element.backgroundColor
      : "transparent",
  opacity: element.opacity ?? 1,
});

const blockStyle = (element) => ({
  left: safeNumber(element.x, 0),
  top: safeNumber(element.y, 0),
  width: safePositive(element.width, 120, 0),
  height: safePositive(element.height, 40, 0),
  border: `${safePositive(element.strokeWidth, 1, 0)}px solid ${element.stroke || "#94a3b8"}`,
  borderRadius: `${safePositive(element.borderRadius, 0, 0)}px`,
  backgroundColor:
    element.backgroundColor && element.backgroundColor !== "transparent"
      ? element.backgroundColor
      : "#f8fafc",
  opacity: safeNumber(element.opacity, 1),
});

const photoStyle = (element) => {
  const photoShape = element.photoShape || "rect";
  let borderRadius = "0px";
  
  if (photoShape === "circular") {
    borderRadius = "50%";
  } else if (photoShape === "oval") {
    borderRadius = "50% 50%";
  } else if (photoShape === "rounded") {
    borderRadius = `${safePositive(element.borderRadius, 8, 0)}px`;
  }

  return {
    ...blockStyle(element),
    borderRadius,
  };
};

const shapeWrapStyle = (element) => ({
  left: safeNumber(element.x, 0),
  top: safeNumber(element.y, 0),
  width: safePositive(element.width, 8, 0),
  height: safePositive(element.height, 8, 0),
  opacity: safeNumber(element.opacity, 1),
});

const curvePath = (shapeKind, width, height, curveDepth) => {
  if (shapeKind === "curveBottom") {
    return `M 0 ${curveDepth} Q ${width / 2} ${-curveDepth} ${width} ${curveDepth} L ${width} ${height} L 0 ${height} Z`;
  }
  return `M 0 0 L ${width} 0 L ${width} ${height - curveDepth} Q ${width / 2} ${height + curveDepth} 0 ${height - curveDepth} Z`;
};

const renderShape = (element, index) => {
  const width = safePositive(element.width, 8, 8);
  const height = safePositive(element.height, 8, 8);
  const fill = element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "transparent";
  const stroke = element.stroke || "transparent";
  const strokeWidth = safePositive(element.strokeWidth, 0, 0);
  const shapeKind = element.shapeKind || "rect";
  const curveDepth = Math.max(0, Math.min(height, safeNumber(element.curveDepth, 16)));
  const halfStroke = strokeWidth / 2;

  return (
    <div key={elementKey(element, index)} className="absolute" style={shapeWrapStyle(element)}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {shapeKind === "ellipse" ? (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={Math.max(0, width / 2 - halfStroke)}
            ry={Math.max(0, height / 2 - halfStroke)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ) : shapeKind === "curveTop" || shapeKind === "curveBottom" ? (
          <path d={curvePath(shapeKind, width, height, curveDepth)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        ) : (
          <rect
            x={halfStroke}
            y={halfStroke}
            width={Math.max(0, width - strokeWidth)}
            height={Math.max(0, height - strokeWidth)}
            rx={Math.max(0, Number(element.borderRadius) || 0)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}
      </svg>
    </div>
  );
};

const IdCardPreview = ({ card }) => {
  if (!card) return null;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: card.template.width,
        height: card.template.height,
        backgroundColor: card.template.backgroundColor || "#ffffff",
        backgroundImage: card.template.backgroundImage ? `url(${card.template.backgroundImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {(card.template.overlayOpacity || 0) > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: card.template.overlayColor || "#000000",
            opacity: card.template.overlayOpacity || 0,
          }}
        />
      )}
      {card.template.elements.map((element, index) => {
        if (element.type === "text" || element.type === "field") {
          return (
            <div
              key={elementKey(element, index)}
              className="absolute flex items-center whitespace-pre-wrap px-1"
              style={textStyle(element)}
            >
              {element.displayValue}
            </div>
          );
        }

        if (element.type === "photo") {
          return (
            <div key={elementKey(element, index)} className="absolute flex items-center justify-center overflow-hidden" style={photoStyle(element)}>
              {element.displayValue ? (
                <img
                  src={element.displayValue}
                  alt="Student"
                  className="h-full w-full object-cover"
                  crossOrigin="anonymous"
                />
              ) : (
                <span className="text-xs font-medium text-slate-500">Photo</span>
              )}
            </div>
          );
        }

        if (element.type === "shape") {
          return renderShape(element, index);
        }

        const qrWidth = safePositive(element.width, 90, 8);
        const qrHeight = safePositive(element.height, 90, 8);
        const qrSize = Math.max(8, Math.min(qrWidth - 8, qrHeight - 8));

        return (
          <div key={elementKey(element, index)} className="absolute flex items-center justify-center bg-white p-1" style={blockStyle(element)}>
            <QRCodeCanvas value={element.displayValue || "ID"} size={qrSize} />
          </div>
        );
      })}
    </div>
  );
};

export default IdCardPreview;
