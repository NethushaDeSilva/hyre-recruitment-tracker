// Add a candidate to a position — drops them into the Applied stage.
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { addCandidate } from "@/data/store";

export default function AddCandidateModal({ open, onClose, position }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setRole("");
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (!name.trim()) return;
    await addCandidate({ name, email, positionId: position.id, appliedRole: role });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add candidate"
      subtitle={position ? `Add a new candidate to ${position.title}.` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()}>Add candidate</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan Lee" autoFocus />
        </Field>
        <Field label="Email address">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
        </Field>
        <Field label="Applied role">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. React Developer" />
        </Field>
        <div className="flex items-center gap-2 rounded-md bg-[#EEF1F5] px-3 py-2.5 text-xs font-medium text-[#64748B] dark:bg-white/[0.05] dark:text-[#94A3B8]">
          <span className="h-2 w-2 rounded-full bg-[#64748B]" /> New candidates start in the Applied stage.
        </div>
      </div>
    </Modal>
  );
}
