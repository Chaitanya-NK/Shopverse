"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import { previewProductImport, runProductImport } from "@/features/products/import-actions";

type Preview = Extract<Awaited<ReturnType<typeof previewProductImport>>, { ok: true }>["data"];
type Result = Extract<Awaited<ReturnType<typeof runProductImport>>, { ok: true }>["data"];

export function ProductImport({ organizationSlug }: { organizationSlug: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [checking, startChecking] = useTransition();
  const [importing, startImporting] = useTransition();

  const ready = preview?.products.filter((p) => p.errors.length === 0) ?? [];
  const withProblems = preview?.products.filter((p) => p.errors.length > 0) ?? [];

  const check = (text: string) =>
    startChecking(async () => {
      setResult(null);
      const res = await previewProductImport({ organizationSlug, csv: text });
      if (!res.ok) {
        setPreview(null);
        setFileError(res.error.fieldErrors?.csv?.[0] ?? res.error.message);
        return;
      }
      setFileError(null);
      setPreview(res.data);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepare your file</CardTitle>
          <CardDescription>
            One row per variant. Rows with the same <code>handle</code> are one product. A handle
            you already use updates that product, and blank cells keep what&apos;s there. Separate
            several tags, shops or choices with <code>|</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={routes.orgProductExport(organizationSlug, true)} download>
              <FileSpreadsheetIcon />
              Blank template
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={routes.orgProductExport(organizationSlug)} download>
              <DownloadIcon />
              Export current products
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload and check</CardTitle>
          <CardDescription>Nothing changes until you confirm the import.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field data-invalid={Boolean(fileError)}>
            <FieldLabel htmlFor="product-csv">CSV file</FieldLabel>
            <Input
              ref={fileRef}
              id="product-csv"
              type="file"
              accept=".csv,text/csv"
              aria-invalid={Boolean(fileError)}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setPreview(null);
                setResult(null);
                if (!file) return;
                if (file.size > 5_000_000) {
                  setFileError("Keep the file under 5 MB");
                  return;
                }
                const text = await file.text();
                setFileName(file.name);
                setCsv(text);
                check(text);
              }}
            />
            <FieldDescription>Save as “CSV UTF-8” from Excel or Google Sheets.</FieldDescription>
            <FieldError>{fileError}</FieldError>
          </Field>
          {checking && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Checking {fileName}…
            </p>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review</CardTitle>
            <CardDescription>
              {ready.length} product{ready.length === 1 ? "" : "s"} ready
              {withProblems.length > 0 && `, ${withProblems.length} with problems (skipped)`}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.errors.length > 0 && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>The file can&apos;t be imported</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {preview.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {preview.products.length > 0 && (
              <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Problems</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...withProblems, ...ready].map((p) => (
                      <TableRow key={p.handle}>
                        <TableCell>
                          <div className="font-medium">{p.title}</div>
                          <div className="font-mono text-xs text-muted-foreground">{p.handle}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {p.lines.length > 3
                            ? `${p.lines[0]}–${p.lines.at(-1)}`
                            : p.lines.join(", ")}
                        </TableCell>
                        <TableCell>
                          {p.action === "create" ? (
                            <Badge>
                              New · {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              Update
                              {p.newVariants > 0 &&
                                ` · +${p.newVariants} variant${p.newVariants === 1 ? "" : "s"}`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-normal">
                          {p.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <CheckCircle2Icon className="size-4" /> Ready
                            </span>
                          ) : (
                            <ul className="space-y-0.5 text-destructive">
                              {p.errors.slice(0, 4).map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                              {p.errors.length > 4 && <li>…and {p.errors.length - 4} more</li>}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {result ? (
              <Alert>
                <CheckCircle2Icon />
                <AlertTitle>
                  Imported: {result.created} new, {result.updated} updated
                </AlertTitle>
                <AlertDescription>
                  {result.skipped > 0 && <p>{result.skipped} skipped because of problems above.</p>}
                  {result.failed.length > 0 && (
                    <ul className="list-disc pl-4">
                      {result.failed.map((f) => (
                        <li key={f.handle}>
                          {f.title}: {f.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href={routes.orgProducts(organizationSlug)} className="underline">
                    Go to products
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={ready.length === 0 || importing || !csv}
                  onClick={() =>
                    startImporting(async () => {
                      const res = await runProductImport({ organizationSlug, csv: csv! });
                      if (!res.ok) {
                        toast.error(res.error.message);
                        return;
                      }
                      setResult(res.data);
                      toast.success("Import finished");
                    })
                  }
                >
                  {importing ? <Spinner /> : <UploadIcon />}
                  Import {ready.length} product{ready.length === 1 ? "" : "s"}
                </Button>
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  Choose another file
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
