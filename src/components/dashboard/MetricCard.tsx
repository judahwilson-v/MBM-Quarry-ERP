import React from "react";

interface MetricCardProps {
  title: string;
  value: string;
  subtext: string;
  variant: "success" | "info" | "warning" | "danger" | "default";
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: React.ElementType;
  size?: "lg";
}

export default function MetricCard({
  title,
  value,
  subtext,
  variant,
  trend,
  trendValue,
  icon: Icon,
  size,
}: MetricCardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return "text-[var(--success)] bg-[var(--success-subtle)]";
      case "danger":
        return "text-[var(--danger)] bg-[var(--danger-subtle)]";
      case "warning":
        return "text-[var(--warning)] bg-[var(--warning-subtle)]";
      case "info":
        return "text-[var(--info)] bg-[var(--info-subtle)]";
      default:
        return "text-[var(--text-primary)] bg-[var(--bg-card-hover)]";
    }
  };

  return (
    <div className={`p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] transition-colors hover:bg-[var(--bg-card-hover)] ${size === "lg" ? "h-full" : ""}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${getVariantStyles()}`}>
          <Icon size={24} />
        </div>
        {trend && trendValue && (
          <div
            className={`flex items-center text-sm font-medium px-2 py-1 rounded-full ${
              trend === "up"
                ? "text-[var(--success)] bg-[var(--success-subtle)]"
                : trend === "down"
                ? "text-[var(--danger)] bg-[var(--danger-subtle)]"
                : "text-[var(--text-secondary)] bg-[var(--border-subtle)]"
            }`}
          >
            {trendValue}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-[var(--text-secondary)] font-medium text-sm mb-1">{title}</h3>
        <div className={`font-bold text-[var(--text-primary)] ${size === "lg" ? "text-4xl" : "text-3xl"}`}>{value}</div>
        <p className="text-[var(--text-muted)] text-sm mt-2">{subtext}</p>
      </div>
    </div>
  );
}
