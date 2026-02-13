export const EVERYONE_GROUP_ID = '__system_everyone__';
export const EVERYONE_GROUP_NAME = 'Everyone';
export const EVERYONE_GROUP_DESCRIPTION = 'Includes all registered users.';

export function isEveryoneGroupId(groupId: string): boolean {
  return groupId === EVERYONE_GROUP_ID;
}

export function isEveryoneGroupName(groupName: string): boolean {
  return groupName.trim().toLowerCase() === EVERYONE_GROUP_NAME.toLowerCase();
}
