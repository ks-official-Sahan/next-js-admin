export type { Matrix, MatrixChange, MatrixCheck, Person, PermissionRow } from "./kit-config";
export { can, defaultMatrix, diffMatrix, matrixFromRows, matrixToRows, validateMatrix } from "./kit-config";
// Who may manage whom is the rank hierarchy of the roles table: getRoleCatalog() in ./roles.
export type { RoleCatalog } from "@sahan-sac/auth-kit/rbac/roles";
