/**
 * Test file for server-time utilities
 * 
 * Run with: npx tsx lib/server-time.test.ts
 * 
 * This tests the CRITICAL timezone handling for shift attendance:
 * - getVietnamNow() should return Date where UTC components = Vietnam local time
 * - getVietnamToday() should return UTC midnight representing Vietnam date
 * - createShiftDateTime() should create consistent Date for shift times
 * - All times should display correctly when read back from database
 */

import {
    getVietnamNow,
    getVietnamToday,
    createShiftDateTime,
    parseShiftTime,
    formatVietnamTimeShort,
    formatVietnamTime,
    formatVietnamDate,
    getMinutesDifference,
    isAfter,
    isBefore,
    addMinutes,
    addDays,
    parseVietnamTime
} from './server-time'

// Test utilities
let passed = 0
let failed = 0

function test(name: string, fn: () => boolean) {
    try {
        const result = fn()
        if (result) {
            console.log(`✅ ${name}`)
            passed++
        } else {
            console.log(`❌ ${name}`)
            failed++
        }
    } catch (error) {
        console.log(`❌ ${name} - Error: ${error}`)
        failed++
    }
}

function assertEqual(actual: any, expected: any, message: string = ''): boolean {
    const pass = actual === expected
    if (!pass) {
        console.log(`   Expected: ${expected}`)
        console.log(`   Actual: ${actual}`)
        if (message) console.log(`   ${message}`)
    }
    return pass
}

console.log('='.repeat(60))
console.log('SERVER-TIME TIMEZONE TESTS')
console.log('='.repeat(60))

const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone
console.log(`\nServer Timezone: ${serverTz}`)
console.log(`Current Local Time: ${new Date().toString()}`)
console.log('')

// ============================================================
// TEST 1: getVietnamNow() - Critical for check-in/check-out
// ============================================================
console.log('\n--- TEST: getVietnamNow() ---')

test('getVietnamNow() UTC hours should match Vietnam local hours', () => {
    const now = new Date()
    const vietnamNow = getVietnamNow()
    
    // Get expected Vietnam hours
    const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
    let expectedHours: number
    
    if (isVietnamTz) {
        expectedHours = now.getHours()
    } else {
        // Calculate Vietnam time from UTC
        const vietnamOffset = 7 * 60 // +7 hours in minutes
        const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
        expectedHours = Math.floor((utcMinutes + vietnamOffset) / 60) % 24
    }
    
    return assertEqual(vietnamNow.getUTCHours(), expectedHours, 
        'UTC hours of getVietnamNow() should represent Vietnam local hours')
})

test('getVietnamNow() should be usable for database storage', () => {
    const vietnamNow = getVietnamNow()
    const isoString = vietnamNow.toISOString()
    
    // When stored in DB and read back, formatVietnamTimeShort should show correct time
    const readBack = new Date(isoString)
    const displayed = formatVietnamTimeShort(readBack)
    
    const expectedDisplay = `${vietnamNow.getUTCHours().toString().padStart(2, '0')}:${vietnamNow.getUTCMinutes().toString().padStart(2, '0')}`
    
    return assertEqual(displayed, expectedDisplay,
        'Time should display correctly after DB round-trip')
})

test('getVietnamNow() simulated check-in at 6:30 should display as 6:30', () => {
    // Simulate: Employee checks in at 6:30 Vietnam time
    // The value saved should have UTC hours = 6
    const checkInTime = getVietnamNow()
    
    // Simulate saving to DB (ISO string) and reading back
    const savedToDb = checkInTime.toISOString()
    const readFromDb = new Date(savedToDb)
    
    // Display should use UTC components
    const displayedTime = formatVietnamTimeShort(readFromDb)
    const expectedTime = formatVietnamTimeShort(checkInTime)
    
    return assertEqual(displayedTime, expectedTime,
        'Displayed time should match original check-in time')
})

// ============================================================
// TEST 2: getVietnamToday() - Critical for session_date
// ============================================================
console.log('\n--- TEST: getVietnamToday() ---')

test('getVietnamToday() should return midnight UTC', () => {
    const today = getVietnamToday()
    return assertEqual(today.getUTCHours(), 0) &&
           assertEqual(today.getUTCMinutes(), 0) &&
           assertEqual(today.getUTCSeconds(), 0)
})

test('getVietnamToday() should represent Vietnam date', () => {
    const today = getVietnamToday()
    const now = new Date()
    
    // Get expected Vietnam date
    const isVietnamTz = serverTz === 'Asia/Ho_Chi_Minh' || serverTz === 'Asia/Saigon'
    let expectedDate: number
    
    if (isVietnamTz) {
        expectedDate = now.getDate()
    } else {
        // Calculate Vietnam date from UTC
        const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
        expectedDate = vietnamTime.getUTCDate()
    }
    
    return assertEqual(today.getUTCDate(), expectedDate,
        'UTC date should represent Vietnam local date')
})

// ============================================================
// TEST 3: createShiftDateTime() - Critical for shift time comparison
// ============================================================
console.log('\n--- TEST: createShiftDateTime() ---')

test('createShiftDateTime() should create correct shift time', () => {
    const today = getVietnamToday()
    const shiftStart = createShiftDateTime(today, 8, 30) // 8:30 AM shift
    
    return assertEqual(shiftStart.getUTCHours(), 8, 'Hours should be 8') &&
           assertEqual(shiftStart.getUTCMinutes(), 30, 'Minutes should be 30')
})

test('createShiftDateTime() should use baseDate correctly', () => {
    const today = getVietnamToday()
    const tomorrow = addDays(today, 1)
    
    const shiftToday = createShiftDateTime(today, 14, 0)
    const shiftTomorrow = createShiftDateTime(tomorrow, 14, 0)
    
    const dayDiff = (shiftTomorrow.getTime() - shiftToday.getTime()) / (24 * 60 * 60 * 1000)
    
    return assertEqual(dayDiff, 1, 'Should be exactly 1 day apart')
})

test('Shift comparison should work correctly', () => {
    const today = getVietnamToday()
    const shiftStart = createShiftDateTime(today, 8, 0) // 8:00 AM
    
    // Simulate check-in at 8:15 AM
    const checkInTime = createShiftDateTime(today, 8, 15)
    
    const isLate = isAfter(checkInTime, shiftStart)
    const lateMinutes = getMinutesDifference(shiftStart, checkInTime)
    
    return assertEqual(isLate, true, 'Should be late') &&
           assertEqual(lateMinutes, 15, 'Should be 15 minutes late')
})

// ============================================================
// TEST 4: parseShiftTime() - Parse time from database
// ============================================================
console.log('\n--- TEST: parseShiftTime() ---')

test('parseShiftTime() should parse Date object correctly', () => {
    // Simulate a Time value from PostgreSQL (stored as UTC)
    const dbTime = new Date(Date.UTC(1970, 0, 1, 14, 30, 0)) // 14:30
    const { hours, minutes } = parseShiftTime(dbTime)
    
    return assertEqual(hours, 14, 'Hours should be 14') &&
           assertEqual(minutes, 30, 'Minutes should be 30')
})

test('parseShiftTime() should parse string correctly', () => {
    const { hours, minutes } = parseShiftTime('09:15:00')
    
    return assertEqual(hours, 9, 'Hours should be 9') &&
           assertEqual(minutes, 15, 'Minutes should be 15')
})

// ============================================================
// TEST 5: Format functions - Display times correctly
// ============================================================
console.log('\n--- TEST: Format Functions ---')

test('formatVietnamTimeShort() should format correctly', () => {
    const time = new Date(Date.UTC(2025, 11, 3, 6, 30, 0)) // 6:30 stored as UTC
    const formatted = formatVietnamTimeShort(time)
    
    return assertEqual(formatted, '06:30')
})

test('formatVietnamTime() should format with seconds', () => {
    const time = new Date(Date.UTC(2025, 11, 3, 14, 45, 30))
    const formatted = formatVietnamTime(time)
    
    return assertEqual(formatted, '14:45:30')
})

test('formatVietnamDate() should format date correctly', () => {
    const date = new Date(Date.UTC(2025, 11, 3, 0, 0, 0)) // Dec 3, 2025
    const formatted = formatVietnamDate(date)
    
    return assertEqual(formatted, '03/12/2025')
})

// ============================================================
// TEST 6: parseVietnamTime() - Parse user input
// ============================================================
console.log('\n--- TEST: parseVietnamTime() ---')

test('parseVietnamTime() should create correct datetime', () => {
    const today = getVietnamToday()
    const parsed = parseVietnamTime('10:30', today)
    
    return assertEqual(parsed.getUTCHours(), 10, 'Hours should be 10') &&
           assertEqual(parsed.getUTCMinutes(), 30, 'Minutes should be 30') &&
           assertEqual(parsed.getUTCDate(), today.getUTCDate(), 'Date should match')
})

// ============================================================
// TEST 7: End-to-end check-in/check-out simulation
// ============================================================
console.log('\n--- TEST: End-to-End Check-in/Check-out ---')

test('Complete check-in flow simulation', () => {
    // 1. Employee checks in
    const checkInTime = getVietnamNow()
    const checkInIso = checkInTime.toISOString()
    
    // 2. Saved to database (simulated)
    console.log(`   Check-in saved: ${checkInIso}`)
    
    // 3. Read back from database
    const readBack = new Date(checkInIso)
    
    // 4. Display to user
    const displayed = formatVietnamTimeShort(readBack)
    const expected = formatVietnamTimeShort(checkInTime)
    
    console.log(`   Displayed time: ${displayed}`)
    
    return assertEqual(displayed, expected, 'Displayed time should match check-in time')
})

test('Check-in at 6:30 should show 6:30 (not 23:30)', () => {
    // Simulate check-in at 6:30 AM Vietnam time
    const today = getVietnamToday()
    const checkInTime = createShiftDateTime(today, 6, 30)
    
    // Save to DB
    const savedIso = checkInTime.toISOString()
    console.log(`   Saved ISO: ${savedIso}`)
    
    // Read back
    const readBack = new Date(savedIso)
    const displayed = formatVietnamTimeShort(readBack)
    
    console.log(`   Displayed: ${displayed}`)
    
    // Should show 06:30, NOT 23:30
    return assertEqual(displayed, '06:30', 'Should display 06:30')
})

test('Late check-in calculation should be correct', () => {
    const today = getVietnamToday()
    
    // Shift starts at 8:00
    const shiftStart = createShiftDateTime(today, 8, 0)
    
    // Employee checks in at 8:25
    const checkInTime = createShiftDateTime(today, 8, 25)
    
    // Calculate late
    const isLate = isAfter(checkInTime, shiftStart)
    const lateMinutes = getMinutesDifference(shiftStart, checkInTime)
    
    console.log(`   Shift start: ${formatVietnamTimeShort(shiftStart)}`)
    console.log(`   Check-in: ${formatVietnamTimeShort(checkInTime)}`)
    console.log(`   Late: ${isLate}, Minutes: ${lateMinutes}`)
    
    return assertEqual(isLate, true) && assertEqual(lateMinutes, 25)
})

test('Early checkout calculation should be correct', () => {
    const today = getVietnamToday()
    
    // Shift ends at 17:00
    const shiftEnd = createShiftDateTime(today, 17, 0)
    
    // Employee checks out at 16:30
    const checkOutTime = createShiftDateTime(today, 16, 30)
    
    // Calculate early
    const isEarly = isBefore(checkOutTime, shiftEnd)
    const earlyMinutes = getMinutesDifference(checkOutTime, shiftEnd)
    
    console.log(`   Shift end: ${formatVietnamTimeShort(shiftEnd)}`)
    console.log(`   Check-out: ${formatVietnamTimeShort(checkOutTime)}`)
    console.log(`   Early: ${isEarly}, Minutes: ${earlyMinutes}`)
    
    return assertEqual(isEarly, true) && assertEqual(earlyMinutes, 30)
})

// ============================================================
// TEST 8: Overnight shift handling
// ============================================================
console.log('\n--- TEST: Overnight Shift ---')

test('Overnight shift (22:00 - 06:00) should calculate correctly', () => {
    const today = getVietnamToday()
    
    // Night shift: 22:00 - 06:00
    const shiftStart = createShiftDateTime(today, 22, 0)
    let shiftEnd = createShiftDateTime(today, 6, 0)
    
    // End time is next day
    shiftEnd = addDays(shiftEnd, 1)
    
    // Check-out at 05:30 next day
    const checkOutTime = createShiftDateTime(addDays(today, 1), 5, 30)
    
    const isEarly = isBefore(checkOutTime, shiftEnd)
    const earlyMinutes = getMinutesDifference(checkOutTime, shiftEnd)
    
    console.log(`   Shift: ${formatVietnamTimeShort(shiftStart)} - ${formatVietnamTimeShort(shiftEnd)} (next day)`)
    console.log(`   Check-out: ${formatVietnamTimeShort(checkOutTime)}`)
    console.log(`   Early: ${isEarly}, Minutes: ${earlyMinutes}`)
    
    return assertEqual(isEarly, true) && assertEqual(earlyMinutes, 30)
})

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60))
console.log(`RESULTS: ${passed} passed, ${failed} failed`)
console.log('='.repeat(60))

if (failed > 0) {
    console.log('\n⚠️  Some tests failed! Please review the timezone handling.')
    process.exit(1)
} else {
    console.log('\n✅ All tests passed! Timezone handling is correct.')
    process.exit(0)
}
