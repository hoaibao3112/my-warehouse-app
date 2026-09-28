import { Card } from "@/components/ui/card"

export default function ReportsLoading() {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="h-10 bg-muted rounded-lg w-48 animate-pulse" />
      <Card className="p-4 md:p-6 space-y-4">
        <div className="h-10 bg-muted rounded-lg animate-pulse" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </Card>
    </div>
  )
}
