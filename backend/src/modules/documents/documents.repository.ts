import { DocumentRecord, Asset, Employee } from "@/db/models";
import { nowIso } from "@/db/connection";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listDocuments(employeeId: string) {
  const rows = await DocumentRecord.find({ employeeId }).sort({ uploadedAt: -1 }).lean();
  return rows.map(toApiDoc);
}

export async function addDocument(input: { employeeId: string; type: string; fileName: string; fileUrl: string }) {
  const doc = await DocumentRecord.create({ ...input, uploadedAt: nowIso() });
  return toApiDoc((await DocumentRecord.findById(doc._id).lean())!);
}

export async function deleteDocument(id: string) {
  await DocumentRecord.deleteOne({ _id: id });
}

export async function getDocument(id: string) {
  const row = await DocumentRecord.findById(id).lean();
  return toApiDoc(row);
}

// --- Assets ---
export async function listAssets(employeeId?: string) {
  if (employeeId) {
    const rows = await Asset.find({ employeeId }).sort({ assignedAt: -1 }).lean();
    return rows.map(toApiDoc);
  }
  const rows = await Asset.find({}).sort({ assignedAt: -1 }).lean();
  if (rows.length === 0) return [];
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).lean();
  const empMap = new Map(employees.map((e) => [e._id, e]));
  return rows.map((r) => {
    const emp = empMap.get(r.employeeId);
    const { _id, ...rest } = r;
    return {
      id: _id,
      ...rest,
      firstName: emp?.firstName ?? null,
      lastName: emp?.lastName ?? null,
      employeeCode: emp?.employeeCode ?? null,
    };
  });
}

export async function assignAsset(input: { employeeId: string; assetTag: string; category: string; name: string }) {
  const doc = await Asset.create({ ...input, assignedAt: nowIso(), status: "ASSIGNED" });
  return toApiDoc((await Asset.findById(doc._id).lean())!);
}

export async function updateAssetStatus(id: string, status: string) {
  const returnedAt = status === "RETURNED" ? nowIso() : null;
  await Asset.updateOne({ _id: id }, { $set: { status, returnedAt } });
  return toApiDoc((await Asset.findById(id).lean())!);
}
