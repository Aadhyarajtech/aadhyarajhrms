import { api } from "./api";

export interface GoogleHoliday {
  id: string;
  title: string;
  date: string;
  endDate: string;
  allDay: true;
  source: "GOOGLE_CALENDAR";
  calendarName: string;
}

export interface GoogleHolidayResponse {
  holidays: GoogleHoliday[];
  source: "GOOGLE_CALENDAR";
  calendarName: string;
  calendarId: string;
  year: number;
  syncedAt: string;
}

export const GoogleCalendarApi = {
  indiaHolidays: (year = new Date().getFullYear()) =>
    api
      .get<GoogleHolidayResponse>(
        "/announcements/google-holidays",
        { params: { year } },
      )
      .then((response) => response.data),
};
