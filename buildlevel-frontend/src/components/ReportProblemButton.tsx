import { useSupport } from "../context/SupportContext";

export default function ReportProblemButton({ source, className = "btn btn-outline", style }: { source?: string; className?: string; style?: React.CSSProperties }) {
  const support = useSupport();
  return (
    <button type="button" className={className} style={style} onClick={() => support.openSupport({ category: source || "Website technical problem" })}>
      REPORT A PROBLEM
    </button>
  );
}
