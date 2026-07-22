import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

// Finds (or creates) a writable device calendar to add events into. iOS
// ships a default calendar tied to the device's local account.
//
// Android has no equivalent "default calendar" or Calendar.getSourcesAsync()
// support — that API is iOS-only in expo-calendar, and calling it on
// Android returns empty/unreliable results, which was silently breaking
// calendar creation here. Android's own documented pattern instead is to
// pass a plain { isLocalAccount: true, name } object directly as the
// source — no source lookup needed at all.
async function getTargetCalendarId() {
  if (Platform.OS === 'ios') {
    const defaultCal = await Calendar.getDefaultCalendarAsync();
    return defaultCal.id;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(c => c.title === 'My Suburb' && c.allowsModifications);
  if (existing) return existing.id;

  return await Calendar.createCalendarAsync({
    title: 'My Suburb',
    color: '#2D6A4F',
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: 'My Suburb' },
    name: 'mySuburbEvents',
    ownerAccount: 'My Suburb',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

// Adds an event to the device calendar with a default 1-hour duration,
// since My Suburb events only store a start time, not an end time. Shared
// by both the Events tab card and the post detail screen so the calendar
// logic lives in exactly one place. Returns { success, message } rather
// than showing UI itself — callers decide how to surface the result.
export default async function addEventToCalendar({ title, description, location, startDate }) {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, message: 'Please allow calendar access to add this event.' };
    }
    const calendarId = await getTargetCalendarId();
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    await Calendar.createEventAsync(calendarId, {
      title,
      notes: description || undefined,
      location: location || undefined,
      startDate,
      endDate,
    });
    return { success: true };
  } catch (e) {
    console.error('addEventToCalendar error:', e);
    return { success: false, message: 'Could not add this event to your calendar. Please try again.' };
  }
}