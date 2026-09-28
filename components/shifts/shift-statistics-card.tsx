"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle2, Clock, TrendingUp } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatDbDateToDisplay } from "@/lib/server-time"

interface ShiftStatistics {
  totalShifts: number
  completedSessions: number
  pendingSessions: number
  inProgressSessions: number
  employmentType: {
    type: "FULLTIME" | "PARTTIME"
    minRequired?: number
    current?: number
    remaining?: number
    met?: boolean
    maxConsecutiveEmpty?: number
    emptyPeriods?: Array<{
      start: string
      end: string
      count: number
      violation: boolean
    }>
    hasViolations?: boolean
  }
}

interface ShiftStatisticsCardProps {
  statistics: ShiftStatistics
  month: string
}

export function ShiftStatisticsCard({ statistics, month }: ShiftStatisticsCardProps) {
  const { employmentType } = statistics
  const isFullTime = employmentType.type === "FULLTIME"

  return (
    <div className="space-y-4">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng ca đăng ký
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalShifts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đã hoàn thành
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statistics.completedSessions}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chờ phê duyệt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {statistics.pendingSessions}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Đang làm việc
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {statistics.inProgressSessions}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employment Type Specific Stats */}
      {isFullTime ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Yêu cầu Full-time</span>
              <Badge variant={employmentType.met ? "default" : "destructive"}>
                {employmentType.met ? "Đạt yêu cầu" : "Chưa đủ"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  Tiến độ: {employmentType.current}/{employmentType.minRequired} ca
                </span>
                <span className="font-medium">
                  {Math.round(
                    ((employmentType.current || 0) / (employmentType.minRequired || 1)) * 100
                  )}
                  %
                </span>
              </div>
              <Progress
                value={
                  ((employmentType.current || 0) / (employmentType.minRequired || 1)) * 100
                }
                className="h-2"
              />
            </div>

            {!employmentType.met && employmentType.remaining! > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Bạn cần đăng ký thêm <strong>{employmentType.remaining} ca</strong> để đạt yêu
                  cầu tối thiểu {employmentType.minRequired} ca/tháng.
                </AlertDescription>
              </Alert>
            )}

            {employmentType.met && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Bạn đã đạt yêu cầu tối thiểu cho nhân viên full-time!
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Yêu cầu Part-time</span>
              <Badge variant={employmentType.hasViolations ? "destructive" : "default"}>
                {employmentType.hasViolations ? "Vi phạm" : "Hợp lệ"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <p className="text-muted-foreground">
                Không được trống lịch quá <strong>{employmentType.maxConsecutiveEmpty} ngày</strong>{" "}
                liên tiếp
              </p>
            </div>

            {employmentType.emptyPeriods && employmentType.emptyPeriods.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Các khoảng trống:</div>
                {employmentType.emptyPeriods.map((period, index) => (
                  <div
                    key={index}
                    className={`text-xs p-2 rounded border ${
                      period.violation
                        ? "bg-red-50 border-red-200 text-red-800"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>
                        {formatDbDateToDisplay(period.start)} -{" "}
                        {formatDbDateToDisplay(period.end)}
                      </span>
                      <Badge variant={period.violation ? "destructive" : "secondary"} className="text-xs">
                        {period.count} ngày
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {employmentType.hasViolations && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Bạn có khoảng trống vượt quá {employmentType.maxConsecutiveEmpty} ngày liên tiếp.
                  Vui lòng đăng ký thêm ca để tuân thủ quy định.
                </AlertDescription>
              </Alert>
            )}

            {!employmentType.hasViolations &&
              employmentType.emptyPeriods &&
              employmentType.emptyPeriods.length === 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Lịch làm việc của bạn tuân thủ đầy đủ quy định part-time!
                  </AlertDescription>
                </Alert>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
