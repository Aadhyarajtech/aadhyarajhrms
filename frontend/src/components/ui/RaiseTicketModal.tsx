import { useState } from "react";
import { api, getErrorMessage } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function RaiseTicketModal({
  open,
  onClose,
}: Props) {
  const [category, setCategory] = useState("HR");
  const [priority, setPriority] = useState("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit() {
    if (!subject.trim()) {
      alert("Please enter subject");
      return;
    }

    if (!description.trim()) {
      alert("Please enter description");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();

      formData.append("category", category);
      formData.append("priority", priority);
      formData.append("subject", subject.trim());
      formData.append("description", description.trim());

      if (attachment) {
        formData.append("attachment", attachment);
      }

      await api.post("/tickets", formData);

      alert("Ticket submitted successfully!");

      setCategory("HR");
      setPriority("MEDIUM");
      setSubject("");
      setDescription("");
      setAttachment(null);

      onClose();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-6 text-2xl font-semibold">
          Raise Ticket
        </h2>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Category
            </label>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option>HR</option>
              <option>Payroll</option>
              <option>Leave</option>
              <option>Attendance</option>
              <option>Recruitment</option>
              <option>Employee Referral</option>
              <option>IT Support</option>
              <option>Complaint</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Priority
            </label>

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Subject
            </label>

            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Description
            </label>

            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your issue..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Attachment{" "}
              <span className="font-normal text-gray-500">
                (Optional)
              </span>
            </label>

            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;

                if (!file) {
                  setAttachment(null);
                  return;
                }

                if (file.size > 8 * 1024 * 1024) {
                  alert("File size must be less than 8 MB.");
                  e.target.value = "";
                  setAttachment(null);
                  return;
                }

                setAttachment(file);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />

            {attachment && (
              <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <p className="font-medium text-gray-700">
                  Selected file:
                </p>

                <p className="break-all text-gray-500">
                  {attachment.name}
                </p>
              </div>
            )}

            <p className="mt-1 text-xs text-gray-500">
              PDF, Word, JPG, PNG or WebP. Maximum 8 MB.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}