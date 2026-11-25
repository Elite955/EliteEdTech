/* Shared TypeScript types for the teacher dashboard */

export interface User {
  id: string
  name: string
  email: string
  role: string
  roleCode: string
}

export interface TeacherProfile {
  user_id: string
  name: string
  email: string
  phone?: string | null
  subjects: string[]
  bio?: string | null
  hourly_rate?: number | null
  approved: boolean
}

export interface AvailabilitySlot {
  id: string
  teacher_id: string
  day_of_week: number      // 0 = Sunday .. 6 = Saturday
  start_time: string       // "HH:mm"
  end_time: string         // "HH:mm"
}

export interface Booking {
  id: string
  student_id: string
  teacher_id: string
  student_name: string
  student_email: string
  starts_at: string
  ends_at: string
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'completed' | 'cancelled'
  amount: number
  created_at: string
}

export interface ClassSession {
  id: string
  booking_id: string
  meeting_provider: string
  meeting_url: string | null
  meeting_creation_status: string
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'
  started_at: string | null
  ended_at: string | null
  recording_url: string | null
  recording_consent: boolean
  created_at: string
  student_id?: string
  student_name?: string
  booking_status?: 'pending' | 'approved' | 'rejected' | 'paid' | 'completed' | 'cancelled'
  canJoin?: boolean
  starts_at?: string
  ends_at?: string
}

export interface AttendanceRecord {
  id: string
  session_id: string
  user_id: string
  user_name: string
  joined_at: string | null
  left_at: string | null
}

export interface Feedback {
  id: string
  booking_id: string
  student_id: string
  student_name: string
  teacher_id: string
  rating: number
  testimony_text: string
  created_at: string
}
