/**
 * Hebrew Calendar Utilities
 * 
 * Simple implementation for Shabbat and holiday detection.
 * Used to avoid sending messages during sacred times.
 */

/**
 * Check if the current time is during Shabbat
 * Shabbat: Friday 18:00 to Saturday 20:00 (approximate)
 */
export function isShabbat(date: Date = new Date()): boolean {
  // Get Israel time
  const israelTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = israelTime.getDay();
  const hour = israelTime.getHours();

  // Saturday before 20:00
  if (day === 6 && hour < 20) {
    return true;
  }

  // Friday after 18:00
  if (day === 5 && hour >= 18) {
    return true;
  }

  return false;
}

/**
 * Check if today is a major Jewish holiday
 * This is a simplified check based on approximate dates
 * For production, consider using a proper Hebrew calendar API
 */
export function isHoliday(date: Date = new Date()): boolean {
  // Get Israel time
  const israelTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const month = israelTime.getMonth() + 1; // 1-12
  const day = israelTime.getDate();

  // Approximate major holiday dates (these shift each year)
  // Rosh Hashanah: around September/October
  // Yom Kippur: 10 days after Rosh Hashanah
  // Sukkot: 5 days after Yom Kippur
  // Pesach: around March/April
  // Shavuot: around May/June

  // Note: For accurate holiday detection, use a Hebrew calendar service
  // This is a placeholder that will be enhanced later
  
  // Check for some fixed holidays (simplified)
  const holidays = [
    // These are approximate and should be updated each year
    // or replaced with a proper API call
  ];

  return false;
}

/**
 * Check if current time is Shabbat or a holiday
 */
export function isShabbatOrHoliday(date: Date = new Date()): boolean {
  return isShabbat(date) || isHoliday(date);
}

/**
 * Get the time of Motzaei Shabbat (Saturday night)
 * Returns the next Saturday at 20:00 Israel time
 */
export function getNextMotzaeiShabbat(date: Date = new Date()): Date {
  const result = new Date(date);
  const israelTime = new Date(result.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = israelTime.getDay();

  // Calculate days until next Saturday night
  let daysUntilSaturday = (6 - day + 7) % 7;
  if (daysUntilSaturday === 0 && israelTime.getHours() >= 20) {
    daysUntilSaturday = 7; // Already past Motzaei Shabbat, get next week
  }

  result.setDate(result.getDate() + daysUntilSaturday);
  result.setHours(20, 30, 0, 0); // 20:30 to give some margin after sunset

  return result;
}

/**
 * Format date in Hebrew for messages
 */
export function formatHebrewDate(date: Date = new Date()): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];

  return `יום ${dayName}, ${day} ב${month}`;
}
