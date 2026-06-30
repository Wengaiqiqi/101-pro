interface ErrorAlertProps {
  message: string;
}

export function ErrorAlert({ message }: ErrorAlertProps) {
  return (
    <div className="px-4 py-3 border border-red-200 rounded-md text-red-700 bg-red-50 flex items-center gap-2" role="alert">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
