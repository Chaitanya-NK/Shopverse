import { Skeleton } from "@/components/ui/skeleton";

export function AuthFormSkeleton({ fields }: { fields: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
