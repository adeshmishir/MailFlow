interface StatusBadgeProps {
  label: string;
  tone: "green" | "red" | "neutral";
}

const toneStyles: Record<StatusBadgeProps["tone"], string> = {
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${toneStyles[tone]}`}>
      {label}
    </span>
  );
}