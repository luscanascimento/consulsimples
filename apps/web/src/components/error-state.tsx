"use client";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center"
    >
      <p className="text-sm font-medium text-red-800">{message}</p>
      <button
        type="button"
        onClick={handleRetry}
        className="min-h-11 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-800 shadow-xs hover:bg-red-100/50"
      >
        Tentar de novo
      </button>
    </div>
  );
}

