import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { TrainingSession } from "@/lib/api/training";
import { assessmentText, blankAttendee, emptyTraining, toTrainingInput, trainingErrors } from "@/lib/training";

import { TrainingSection } from "../training-section";

const save = jest.fn();
let sessions: TrainingSession[] = [];
let session = { user: { id: "user-engineer", role: "engineer" } };

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/auth/session", () => ({ getSession: () => session }));
jest.mock("@/components/documents/attachments", () => ({
  Attachments: ({ count }: { count: number }) => <p>{count} files</p>,
}));
jest.mock("@/components/contracts/device-picker", () => ({
  DevicePicker: ({ value }: { value: Array<{ assetTagNumber: string }> }) => (
    <p>Devices: {value.map((d) => d.assetTagNumber).join(", ")}</p>
  ),
}));
jest.mock("@/lib/hooks/use-training", () => ({
  useTraining: () => ({ isPending: false, isError: false, data: sessions }),
  useSaveTraining: () => ({ mutateAsync: save, isPending: false }),
}));

const device = { id: "a1", assetTagNumber: "SP-1", equipmentName: "Syringe pump" };

const recorded = (): TrainingSession => ({
  id: "t1",
  heldOn: "2026-10-08T00:00:00.000Z",
  kind: "OPERATOR",
  topic: "Loading, alarms and occlusion pressure",
  equipment: "BD Alaris syringe pumps",
  trainer: "Priya Menon",
  trainerFrom: "BD India",
  durationHours: 1.5,
  notes: null,
  recordedAt: "2026-10-08T10:00:00.000Z",
  recordedBy: "Eli Engineer",
  devices: [device],
  attendees: [
    { name: "Asha Rao", designation: "Staff nurse", department: "ICU", assessment: "PASSED" },
    { name: "Rahul Verma", designation: null, department: null, assessment: "NEEDS_RETRAINING" },
  ],
  files: 1,
});

describe("training form rules", () => {
  it("asks for what the API asks for, ignoring empty rows", () => {
    const v = { ...emptyTraining(), attendees: [blankAttendee(), { ...blankAttendee(), designation: "Nurse" }] };
    expect(trainingErrors({ ...v, hours: "1.55" })).toEqual({
      topic: "Say what the training covered",
      equipment: "Name the equipment",
      trainer: "Name the trainer",
      hours: "Enter the hours, e.g. 1.5",
      attendees: "Give each attendee's name",
    });
    expect(trainingErrors({ ...v, heldOn: "2999-01-01", attendees: [blankAttendee()] })).toMatchObject({
      heldOn: "The training date is in the future",
      attendees: "Add at least one attendee",
    });
  });

  it("sends only what was filled in", () => {
    const v = {
      ...emptyTraining([device]),
      topic: " Alarms ",
      trainer: "Priya",
      hours: "2",
      attendees: [{ ...blankAttendee(), name: " Asha " }, blankAttendee()],
    };
    expect(v.equipment).toBe("Syringe pump");
    expect(toTrainingInput(v)).toEqual({
      heldOn: v.heldOn,
      kind: "OPERATOR",
      topic: "Alarms",
      equipment: "Syringe pump",
      trainer: "Priya",
      durationHours: 2,
      deviceIds: ["a1"],
      attendees: [{ name: "Asha", assessment: "PASSED" }],
    });
    expect(assessmentText(recorded().attendees)).toBe("1 passed, 1 needs retraining");
  });
});

describe("TrainingSection", () => {
  beforeEach(() => {
    save.mockReset().mockResolvedValue({});
    sessions = [];
    session = { user: { id: "user-engineer", role: "engineer" } };
  });

  it("records training on this device, with who attended", async () => {
    const user = userEvent.setup();
    render(<TrainingSection device={device} />);
    expect(screen.getByText(/No training recorded on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record training…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Devices: SP-1")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Record training" }));
    expect(save).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Add at least one attendee")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/^What it covered/), "Loading and alarms");
    await user.type(within(dialog).getByLabelText(/^Trainer(?! from)/), "Priya Menon");
    await user.type(within(dialog).getByLabelText("Person 1: name"), "Asha Rao");
    await user.type(within(dialog).getByLabelText("Person 1: designation"), "Staff nurse");
    await user.click(within(dialog).getByRole("button", { name: "Add person" }));
    await user.type(within(dialog).getByLabelText("Person 2: name"), "Rahul Verma");
    await user.selectOptions(within(dialog).getByLabelText("Person 2: assessment"), "NEEDS_RETRAINING");
    await user.click(within(dialog).getByRole("button", { name: "Record training" }));
    expect(save).toHaveBeenCalledWith({
      id: undefined,
      body: expect.objectContaining({
        topic: "Loading and alarms",
        equipment: "Syringe pump",
        trainer: "Priya Menon",
        deviceIds: ["a1"],
        attendees: [
          { name: "Asha Rao", designation: "Staff nurse", assessment: "PASSED" },
          { name: "Rahul Verma", assessment: "NEEDS_RETRAINING" },
        ],
      }),
    });
  });

  it("shows each session and who attended; only engineers correct it", async () => {
    sessions = [recorded()];
    const user = userEvent.setup();
    const { unmount } = render(<TrainingSection device={device} />);
    expect(screen.getByText("BD Alaris syringe pumps")).toBeInTheDocument();
    expect(screen.getByText(/Priya Menon, BD India · 1.5 h · SP-1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 attended: 1 passed, 1 needs retraining" }));
    expect(screen.getByText("Rahul Verma")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Correct" }));
    expect(screen.getByLabelText("Person 2: name")).toHaveValue("Rahul Verma");
    unmount();

    session = { user: { id: "user-viewer", role: "viewer" } };
    render(<TrainingSection device={device} />);
    expect(screen.queryByRole("button", { name: "Correct" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record training…" })).not.toBeInTheDocument();
  });
});
