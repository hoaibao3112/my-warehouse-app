/**
 * Server-side geolocation utilities for GPS validation
 * Used for attendance check-in/check-out distance validation
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000 // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
}

/**
 * Check if user is within allowed radius of a location
 * @param userLat - User's latitude
 * @param userLon - User's longitude
 * @param targetLat - Target location latitude
 * @param targetLon - Target location longitude
 * @param radiusMeters - Allowed radius in meters
 * @returns Object with validation result and distance
 */
export function isWithinRadius(
    userLat: number,
    userLon: number,
    targetLat: number,
    targetLon: number,
    radiusMeters: number
): { isValid: boolean; distanceMeters: number } {
    const distance = calculateDistance(userLat, userLon, targetLat, targetLon)
    return {
        isValid: distance <= radiusMeters,
        distanceMeters: Math.round(distance),
    }
}

/**
 * Checkpoint with distance information
 */
export interface CheckpointWithDistance {
    id: string
    code: string
    name: string
    latitude: number
    longitude: number
    checkin_radius_meters: number
    distanceMeters: number
    isWithinRadius: boolean
    warehouse_id?: string | null
}

/**
 * Find the nearest checkpoint from a list of checkpoints
 * @param userLat - User's latitude
 * @param userLon - User's longitude
 * @param checkpoints - Array of checkpoints to check
 * @returns Sorted array with distance info, nearest first
 */
export function findNearestCheckpoints(
    userLat: number,
    userLon: number,
    checkpoints: Array<{
        id: string
        code: string
        name: string
        latitude: number | { toNumber: () => number }
        longitude: number | { toNumber: () => number }
        checkin_radius_meters: number
        warehouse_id?: string | null
    }>
): CheckpointWithDistance[] {
    return checkpoints
        .map((cp) => {
            // Handle Prisma Decimal type
            const lat = typeof cp.latitude === "number" ? cp.latitude : cp.latitude.toNumber()
            const lon = typeof cp.longitude === "number" ? cp.longitude : cp.longitude.toNumber()

            const { isValid, distanceMeters } = isWithinRadius(
                userLat,
                userLon,
                lat,
                lon,
                cp.checkin_radius_meters
            )

            return {
                id: cp.id,
                code: cp.code,
                name: cp.name,
                latitude: lat,
                longitude: lon,
                checkin_radius_meters: cp.checkin_radius_meters,
                distanceMeters,
                isWithinRadius: isValid,
                warehouse_id: cp.warehouse_id,
            }
        })
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
}

/**
 * Validation result for GPS check
 */
export interface GPSValidationResult {
    isValid: boolean
    error?: string
    checkpoint?: CheckpointWithDistance
    nearestCheckpoint?: CheckpointWithDistance
    distanceMeters?: number
    allCheckpoints?: CheckpointWithDistance[]
}

/**
 * Validate user's GPS location against available checkpoints
 * No permission required - checks if user is within range of ANY checkpoint
 * @param userLat - User's latitude
 * @param userLon - User's longitude
 * @param checkpoints - All available checkpoints to check
 * @param action - 'check_in' or 'check_out' (for logging purposes)
 * @returns Validation result with checkpoint info
 */
export function validateGPSAgainstCheckpoints(
    userLat: number,
    userLon: number,
    checkpoints: Array<{
        id: string
        code: string
        name: string
        latitude: number | { toNumber: () => number }
        longitude: number | { toNumber: () => number }
        checkin_radius_meters: number
        warehouse_id?: string | null
    }>,
    action: "check_in" | "check_out" = "check_in"
): GPSValidationResult {
    if (!checkpoints || checkpoints.length === 0) {
        return {
            isValid: false,
            error: "Chưa có điểm chấm công nào được cấu hình. Vui lòng liên hệ quản lý.",
        }
    }

    // Find nearest checkpoints with distance (no permission filtering needed)
    const checkpointsWithDistance = findNearestCheckpoints(userLat, userLon, checkpoints)

    // Find first checkpoint within radius
    const validCheckpoint = checkpointsWithDistance.find((cp) => cp.isWithinRadius)

    if (validCheckpoint) {
        return {
            isValid: true,
            checkpoint: validCheckpoint,
            allCheckpoints: checkpointsWithDistance,
        }
    }

    // No valid checkpoint found - return error with nearest info
    const nearest = checkpointsWithDistance[0]
    const excessMeters = nearest.distanceMeters - nearest.checkin_radius_meters

    return {
        isValid: false,
        error: `Bạn đang ở ngoài phạm vi chấm công. Điểm gần nhất: ${nearest.name} (cách ${nearest.distanceMeters}m, vượt quá ${excessMeters}m).`,
        nearestCheckpoint: nearest,
        distanceMeters: nearest.distanceMeters,
        allCheckpoints: checkpointsWithDistance,
    }
}

/**
 * Validate GPS against warehouse location (backwards compatible)
 * Used when no checkpoint system is configured
 */
export function validateGPSAgainstWarehouse(
    userLat: number,
    userLon: number,
    warehouse: {
        id: string
        name: string
        latitude: number | { toNumber: () => number } | null
        longitude: number | { toNumber: () => number } | null
        checkin_radius_meters: number | null
    }
): GPSValidationResult {
    // If warehouse has no GPS coordinates, skip validation
    if (!warehouse.latitude || !warehouse.longitude) {
        return {
            isValid: true,
            error: undefined,
        }
    }

    const lat =
        typeof warehouse.latitude === "number"
            ? warehouse.latitude
            : warehouse.latitude.toNumber()
    const lon =
        typeof warehouse.longitude === "number"
            ? warehouse.longitude
            : warehouse.longitude.toNumber()
    const radius = warehouse.checkin_radius_meters || 3000 // Default 3km if not set

    const { isValid, distanceMeters } = isWithinRadius(userLat, userLon, lat, lon, radius)

    if (isValid) {
        return {
            isValid: true,
            distanceMeters,
        }
    }

    const excessMeters = distanceMeters - radius

    return {
        isValid: false,
        error: `Bạn đang ở ngoài phạm vi kho ${warehouse.name} (cách ${distanceMeters}m, vượt quá ${excessMeters}m).`,
        distanceMeters,
    }
}
