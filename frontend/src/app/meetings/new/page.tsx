import { redirect } from "next/navigation";

export default function LegacyNewMeetingPage() {
  redirect("/create-meeting");
}
