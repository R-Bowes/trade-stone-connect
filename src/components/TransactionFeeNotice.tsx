import { Percent } from "lucide-react";

interface TransactionFeeNoticeProps {
  className?: string;
}

export function TransactionFeeNotice({ className = "" }: TransactionFeeNoticeProps) {
  return (
    <div className={`rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 ${className}`}>
      <div className="flex items-start gap-2">
        <Percent className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">
          <span className="font-semibold">2% Transaction Notice:</span> A 2% platform fee applies to all
          invoicing and transaction activity.
        </p>
      </div>
    </div>
  );
}
