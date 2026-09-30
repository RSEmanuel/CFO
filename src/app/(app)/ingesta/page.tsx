"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/context/SessionContext";
import { useLocale } from "@/context/LocaleContext";
import { monthLabelKey } from "@/i18n/format";
import { ApiError, apiRequest, uploadWithProgress } from "@/lib/api";
import { invalidateApiCache } from "@/lib/api-cache";
import type { QualityIssue } from "@/lib/session-types";
import type { MissingInput } from "@/services/dataCapabilities";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { DragEvent, useState } from "react";
import { toast } from "sonner";

type DetectPreview = {
  sha256: string;
  filename: string;
  sourceSystem: string;
  documentType: string;
  headerStartRow: number | null;
  headerRow: number | null;
  sheetName: string | null;
  confidence: number;
  persistable: boolean;
  inferredPeriodo: number | null;
  inferredAnio: number | null;
  rowCountEstimate: number;
  mappedRowCount?: number;
  missingCanonical: string[];
  notes: string[];
  errorCode?: "AMBIGUOUS_MAPPING";
  selectedProfileId: string | null;
  profileCandidates: Array<{
    profileId: string;
    profileKey: string;
    profileVersion: number;
    origin: "BUILTIN" | "TENANT";
    score: number;
  }>;
};

function isExcel(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xlsm");
}

export default function IngestaPage() {
  const { t } = useLocale();
  const { user, tenantId, periodo, anio, selectPeriod, refreshPeriods } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [previews, setPreviews] = useState<DetectPreview[]>([]);
  const [detectionId, setDetectionId] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
  const [useFilePeriod, setUseFilePeriod] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [commitSummary, setCommitSummary] = useState<{
    outcome: "COMMITTED" | "COMMITTED_WITH_WARNINGS";
    counts: { balanza: number; ventas: number; egresos: number; tesoreria: number; auxiliarMovimientos: number };
    periodo: number;
    anio: number;
    availableModules: string[];
    missingInputs: MissingInput[];
  } | null>(null);

  if (user?.role === "CLIENT_VIEWER") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("ingesta.unavailable")}</CardTitle>
          <CardDescription>
            {t("ingesta.viewerHelp")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function takeFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list).filter((file) => {
      if (!isExcel(file.name)) {
        toast.error(t("ingesta.invalidExcel", { filename: file.name }));
        return false;
      }
      return true;
    });
    setFiles(next);
    setIssues([]);
    setPreviews([]);
    setDetectionId(null);
    setSelectedProfiles({});
    setProgress(0);
    setCommitSummary(null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    takeFiles(event.dataTransfer.files);
  }

  function appendForm(form: FormData) {
    if (!tenantId) return;
    form.set("tenantId", tenantId);
    form.set("periodo", String(periodo));
    form.set("anio", String(anio));
    form.set("useFilePeriod", String(useFilePeriod));
    for (const file of files) {
      form.append("files", file);
    }
  }

  async function onDetect() {
    if (files.length === 0 || !tenantId) return;
    setUploading(true);
    setIssues([]);
    try {
      const form = new FormData();
      appendForm(form);
      const result = await apiRequest<{ detectionId: string; previews: DetectPreview[] }>("/api/ingest/detect", {
        method: "POST",
        body: form,
      });
      setPreviews(result.previews);
      setDetectionId(result.detectionId);
      setSelectedProfiles(
        Object.fromEntries(
          result.previews
            .filter((preview) => preview.selectedProfileId)
            .map((preview) => [preview.sha256, preview.selectedProfileId!]),
        ),
      );
      const mismatch = result.previews.find(
        (item) =>
          item.inferredPeriodo &&
          item.inferredAnio &&
          (item.inferredPeriodo !== periodo || item.inferredAnio !== anio),
      );
      if (mismatch) {
        setUseFilePeriod(true);
        toast.message(
          t("ingesta.filePeriodWarning", { period: Number(mismatch.inferredPeriodo), year: Number(mismatch.inferredAnio) }),
        );
      }
    } catch (error) {
      const key = error instanceof ApiError ? `errors.${error.code}` : "";
      const translated = key ? t(key) : key;
      toast.error(translated && translated !== key ? translated : t("ingesta.detectError"));
    } finally {
      setUploading(false);
    }
  }

  async function onCommit() {
    if (files.length === 0 || !tenantId) return;
    setUploading(true);
    setIssues([]);
    setProgress(5);
    try {
      const form = new FormData();
      appendForm(form);
      if (detectionId) {
        form.set("detectionId", detectionId);
      }
      form.set("selectedProfiles", JSON.stringify(selectedProfiles));
      const result = (await uploadWithProgress("/api/ingest/commit", form, setProgress)) as {
        counts: { balanza: number; ventas: number; egresos: number; tesoreria: number; auxiliarMovimientos: number };
        warnings?: QualityIssue[];
        periodo: number;
        anio: number;
        outcome: "COMMITTED" | "COMMITTED_WITH_WARNINGS";
        availableModules?: string[];
        missingInputs?: MissingInput[];
      };
      toast.success(
        t("ingesta.uploadSuccess", {
          period: result.periodo,
          year: result.anio,
          summary: [
            result.counts.balanza > 0 ? t("ingesta.counts.accounts", { count: result.counts.balanza }) : null,
            result.counts.ventas > 0 ? t("ingesta.counts.sales", { count: result.counts.ventas }) : null,
            result.counts.egresos > 0 ? t("ingesta.counts.expenses", { count: result.counts.egresos }) : null,
            result.counts.tesoreria > 0 ? t("ingesta.counts.treasury", { count: result.counts.tesoreria }) : null,
            result.counts.auxiliarMovimientos > 0
              ? t("ingesta.counts.movements", { count: result.counts.auxiliarMovimientos })
              : null,
          ]
            .filter(Boolean)
            .join(", ") || t("ingesta.noneYet"),
        }),
      );
      setIssues(result.warnings ?? []);
      setCommitSummary({
        ...result,
        availableModules: result.availableModules ?? [],
        missingInputs: result.missingInputs ?? [],
      });
      selectPeriod(`${result.anio}-${String(result.periodo).padStart(2, "0")}`);
      refreshPeriods();
      invalidateApiCache();
      setFiles([]);
      setPreviews([]);
      setDetectionId(null);
      setSelectedProfiles({});
    } catch (error) {
      if (error instanceof ApiError && error.code === "QUALITY_ERROR") {
        const raw = error.details?.issues;
        setIssues(Array.isArray(raw) ? (raw as QualityIssue[]) : []);
        toast.error(error.message || t("errors.QUALITY_ERROR"));
      } else if (error instanceof ApiError) {
        toast.error(error.message || t("ingesta.loadError"));
      } else {
        toast.error(t("ingesta.uploadFailed"));
      }
    } finally {
      setUploading(false);
    }
  }

  const periodMismatch = previews.some(
    (item) =>
      item.inferredPeriodo &&
      item.inferredAnio &&
      (item.inferredPeriodo !== periodo || item.inferredAnio !== anio),
  );
  const canCommit =
    files.length > 0 &&
    previews.length > 0 &&
    previews.some(
      (item) =>
        Boolean(item.selectedProfileId) ||
        Boolean(selectedProfiles[item.sha256]),
    ) &&
    previews.some(
      (item) =>
        item.persistable ||
        (item.errorCode === "AMBIGUOUS_MAPPING" && Boolean(selectedProfiles[item.sha256])),
    ) &&
    previews.every(
      (item) =>
        item.errorCode !== "AMBIGUOUS_MAPPING" || Boolean(selectedProfiles[item.sha256]),
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-lg font-bold tracking-tight text-clay">{t("nav.ingest")}</p>
        <p className="text-sm text-muted-foreground">
          {t("ingesta.sessionPeriod", { month: t(monthLabelKey(periodo - 1)), year: anio })}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("ingesta.uploadExcel")}</CardTitle>
          <CardDescription>
            {t("ingesta.uploadHelp")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center ${
              dragOver ? "border-primary bg-accent" : "border-muted-foreground/30"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <UploadCloud className="mb-3 h-10 w-10 text-primary" />
            <p className="text-sm font-medium">{t("ingesta.dropFiles")}</p>
            <p className="text-xs text-muted-foreground">{t("ingesta.fileTypes")}</p>
            <input
              id="file-input"
              type="file"
              multiple
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(event) => takeFiles(event.target.files)}
            />
          </div>
          {files.map((file) => (
            <div key={file.name} className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>{file.name}</span>
              <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
            </div>
          ))}
          {uploading || progress > 0 ? <Progress value={progress} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onDetect} disabled={files.length === 0 || uploading}>
              {t("ingesta.detect")}
            </Button>
            <Button type="button" onClick={onCommit} disabled={!canCommit || uploading}>
              {uploading ? t("ingesta.validating") : t("ingesta.confirm")}
            </Button>
          </div>
          {periodMismatch ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={useFilePeriod}
                onChange={(event) => setUseFilePeriod(event.target.checked)}
              />
              <span>
                {t("ingesta.useFilePeriod", { month: t(monthLabelKey(periodo - 1)), year: anio })}
              </span>
            </label>
          ) : null}
          {previews.length > 0 && !canCommit ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              {previews.some(
                (item) =>
                  !item.persistable &&
                  !item.selectedProfileId &&
                  !selectedProfiles[item.sha256],
              ) ? (
                <p>{t("ingesta.commitBlockedProfile")}</p>
              ) : null}
              {periodMismatch && !useFilePeriod ? (
                <p>{t("ingesta.commitBlockedPeriod")}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
      {commitSummary ? (
        <Card className="border-favorable/30">
          <CardHeader>
            <CardTitle>{t("ingesta.saved")}</CardTitle>
            <CardDescription>
              {t("ingesta.usableAccounts", { count: commitSummary.counts.balanza })} · {t(monthLabelKey(commitSummary.periodo - 1))}{" "}
              {commitSummary.anio}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {t("ingesta.availableModules", {
                modules: commitSummary.availableModules.length
                  ? commitSummary.availableModules.join(", ")
                  : t("ingesta.noneYet"),
              })}
            </p>
            {commitSummary.missingInputs.length ? (
              <div className="space-y-2">
                {commitSummary.missingInputs.map((item) => (
                  <div key={item.module} className="rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p className="font-medium text-amber-900">
                      {t(`ingesta.missingInputs.${item.module}Title`)}
                    </p>
                    <p className="text-amber-800">
                      {t(`ingesta.missingInputs.${item.module}Message`)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {previews.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("ingesta.preview")}</CardTitle>
            <CardDescription>{t("ingesta.previewHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {previews.map((item) => (
              <div key={item.filename} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{item.filename}</p>
                <p
                  className={
                    item.persistable
                      ? "font-medium text-favorable"
                      : "text-muted-foreground"
                  }
                >
                  {item.documentType === "balanza"
                    ? t("ingesta.trialBalance")
                    : item.documentType === "flujo_efectivo"
                      ? t("ingesta.docTypes.flujo_efectivo")
                      : item.documentType === "auxiliar_cuentas"
                        ? t("ingesta.docTypes.auxiliar_cuentas")
                        : item.documentType}{" "}
                  · {item.sourceSystem === "compac" ? "Compac" : item.sourceSystem}
                  {item.persistable
                    ? ` · ${t("ingesta.ready")}`
                    : ` · ${t("ingesta.notSaved")}`}
                </p>
                <p className="text-muted-foreground">
                  {t("ingesta.sheet", { sheet: item.sheetName ?? "—" })} ·{" "}
                  {t("ingesta.header", {
                    header:
                      item.headerStartRow && item.headerRow
                        ? item.headerStartRow === item.headerRow
                          ? t("ingesta.row", { row: item.headerRow })
                          : t("ingesta.rows", { start: item.headerStartRow, end: item.headerRow })
                        : t("ingesta.notDetected"),
                  })}{" "}
                  · {t("ingesta.physicalRows", { count: item.rowCountEstimate })}
                  {item.inferredPeriodo && item.inferredAnio
                    ? ` · ${t("ingesta.periodValue", { month: t(monthLabelKey(item.inferredPeriodo - 1)), year: item.inferredAnio })}`
                    : ""}
                </p>
                {item.mappedRowCount != null ? (
                  <p className="font-medium">
                    {t("ingesta.usableAccounts", { count: item.mappedRowCount })}
                  </p>
                ) : null}
                {!item.selectedProfileId &&
                !selectedProfiles[item.sha256] &&
                item.errorCode !== "AMBIGUOUS_MAPPING" ? (
                  <p className="text-xs text-desfavorable">
                    {t("ingesta.mappingMissing")}
                  </p>
                ) : null}
                {item.notes.map((note) => (
                  <p key={note} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
                {item.errorCode === "AMBIGUOUS_MAPPING" ? (
                  <label className="mt-2 block text-xs">
                    <span className="mb-1 block font-medium">
                      {t("ingesta.selectFormat")}
                    </span>
                    <select
                      value={selectedProfiles[item.sha256] ?? ""}
                      onChange={(event) =>
                        setSelectedProfiles((current) => ({
                          ...current,
                          [item.sha256]: event.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-control border border-input bg-card px-2"
                    >
                      <option value="">{t("ingesta.selectProfile")}</option>
                      {item.profileCandidates.map((candidate) => (
                        <option
                          key={candidate.profileId}
                          value={candidate.profileId}
                        >
                          {candidate.profileKey} v{candidate.profileVersion} ·{" "}
                          {(candidate.score * 100).toFixed(0)}% · {candidate.origin}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {(item.selectedProfileId || selectedProfiles[item.sha256]) &&
                item.missingCanonical.length > 0 ? (
                  <p className="text-xs text-desfavorable">{t("ingesta.missing", { fields: item.missingCanonical.join(", ") })}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {issues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("ingesta.validation")}</CardTitle>
            <CardDescription>{t("ingesta.validationHelp")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {issues.map((issue, index) => (
                <li
                  key={`${issue.rule}-${index}`}
                  className={
                    issue.severity === "WARNING"
                      ? "rounded-md border border-border bg-muted/40 p-3"
                      : "rounded-md border border-destructive/30 bg-destructive/5 p-3"
                  }
                >
                  <p className={issue.severity === "WARNING" ? "font-medium" : "font-medium text-destructive"}>
                    {issue.rule}
                    {issue.severity ? ` · ${issue.severity}` : ""}
                  </p>
                  <p>{issue.message}</p>
                  {issue.sheet ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ingesta.sheet", { sheet: issue.sheet })}
                      {issue.row ? ` · ${t("ingesta.row", { row: issue.row })}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
