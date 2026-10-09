/** Relations to select for `describeLocation`. */
export const LOCATION_SELECT = {
  currentFacility: { select: { facilityName: true } },
  currentRoom: { select: { roomName: true, roomCode: true } },
  custodianDepartment: { select: { departmentName: true } },
} as const;

/** "Bay 3 (ICU-03), ICU, City General": room, department, facility. */
export function describeLocation(asset: {
  currentFacility?: { facilityName: string } | null;
  currentRoom?: { roomName: string; roomCode: string } | null;
  custodianDepartment?: { departmentName: string } | null;
}): string {
  return [
    asset.currentRoom
      ? `${asset.currentRoom.roomName} (${asset.currentRoom.roomCode})`
      : null,
    asset.custodianDepartment?.departmentName ?? null,
    asset.currentFacility?.facilityName ?? null,
  ]
    .filter(Boolean)
    .join(', ');
}
