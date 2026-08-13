export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <p className="text-sm text-red-800">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="min-h-11 rounded-md border border-red-300 bg-white px-4 text-sm">
          Tentar de novo
        </button>
      )}
    </div>
  );
}
