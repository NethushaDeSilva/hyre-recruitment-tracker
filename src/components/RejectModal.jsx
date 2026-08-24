// Reject a candidate with a reason + optional comment. Nobody is deleted — they
// stay in the talent pool with this record attached. Handles one candidate or,
// when `count` is passed, a whole batch of selected applicants at once.
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { stageLabelOf } from "@/lib/stages";
import { REJECTION_REASONS } from "@/lib/rejection";

export default function RejectModal({ open, candidate, count = 0, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Bulk mode when a count (>1) is given and no single candidate is targeted.
  const bulk = !candidate && count > 1;

  const close = () => {
    setReason("");
    setComment("");
    setBusy(false);
    onClose();
  };

  const confirm = async () => {
    if (!reason) return;
    setBusy(true);
    await onConfirm({ reason, comment: comment.trim() });
    close();
  };

  const stageLabel = candidate ? stageLabelOf(candidate.stage) : "";
  const title = bulk ? `Reject ${count} candidates` : "Reject candidate";
  const subtitle = bulk
    ? `${count} applicants selected — the same reason will be recorded for each`
    : candidate
    ? `${candidate.name} · currently at ${stageLabel}`
    : "";
  const button = busy
    ? "Rejecting…"
    : bulk
    ? `Reject ${count} candidates`
    : "Reject candidate";

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={confirm} disabled={!reason || busy} className="bg-[#DC2626] hover:bg-[#B91C1C]">
            {button}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason *">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
            <option value="">Select a reason…</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <Field label="Comment (optional)">
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add context for future reference — e.g. strong communicator, but needs 2 more years in audit."
          />
        </Field>
        <div className="flex items-start gap-2 rounded-md bg-[#EEF1F5] px-3 py-2.5 text-xs font-medium text-[#64748B] dark:bg-white/[0.05] dark:text-[#94A3B8]">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#64748B]" />
          {bulk ? "They are all kept" : "The candidate is kept"} in the talent pool — you can reconsider {bulk ? "them" : "them"} for future vacancies.
        </div>
      </div>
    </Modal>
  );
}
