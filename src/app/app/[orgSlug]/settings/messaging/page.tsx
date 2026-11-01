import { MessageCircleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { routes } from "@/config/routes";
import {
  MessagingSettingsForm,
  TestMessage,
} from "@/features/messaging/components/messaging-settings-form";
import { getMessagingSettings, listMessages } from "@/features/messaging/queries";
import { MESSAGE_EVENTS, type MessageEvent } from "@/features/messaging/templates";
import { can } from "@/features/organizations/permissions";
import { requireMembership } from "@/features/organizations/queries";
import { maskPhone } from "@/lib/messaging/phone";

export const metadata: Metadata = { title: "WhatsApp & SMS" };

type Props = PageProps<"/app/[orgSlug]/settings/messaging">;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default function MessagingPage({ params }: Props) {
  return (
    <>
      <PageHeader
        title="WhatsApp & SMS"
        description="Order updates on the customer's phone, for those who ask for them at checkout."
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Messaging params={params} />
      </Suspense>
    </>
  );
}

async function Messaging({ params }: Pick<Props, "params">) {
  const { orgSlug } = await params;
  const { organization, role } = await requireMembership(orgSlug);
  if (!can(role, "payments.manage"))
    return (
      <p className="text-sm text-muted-foreground">Only owners and admins can manage messaging.</p>
    );
  const [settings, messages] = await Promise.all([
    getMessagingSettings(organization.id),
    listMessages(organization.id),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <MessagingSettingsForm organizationSlug={orgSlug} settings={settings} />
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Sent messages</CardTitle>
              <CardDescription>The last 50, newest first.</CardDescription>
            </div>
            {settings.connected && <TestMessage organizationSlug={orgSlug} />}
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleIcon />
                  </EmptyMedia>
                  <EmptyTitle>No messages yet</EmptyTitle>
                  <EmptyDescription>
                    Messages appear here as orders are confirmed, shipped and delivered.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Update</TableHead>
                      <TableHead className="min-w-72">Message</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                          {timeFormat.format(new Date(m.createdAt))}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {maskPhone(m.toPhone)}
                          <span className="block font-sans text-muted-foreground">
                            {m.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                            {m.provider === "test" ? " · test" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.orderId ? (
                            <Link
                              href={routes.orgOrder(orgSlug, m.orderId)}
                              className="hover:underline"
                            >
                              {MESSAGE_EVENTS[m.event as MessageEvent] ?? m.event}
                            </Link>
                          ) : (
                            (MESSAGE_EVENTS[m.event as MessageEvent] ?? "Test")
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-normal">{m.body}</TableCell>
                        <TableCell>
                          {m.status === "sent" ? (
                            <Badge variant="secondary">Sent</Badge>
                          ) : (
                            <Badge variant="destructive" title={m.error ?? undefined}>
                              Failed
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Trying it out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <b>Test outbox</b> needs nothing: messages are written to the log here instead of being
            sent.
          </p>
          <p>
            <b>Twilio</b> has a free trial. For WhatsApp, join Twilio&apos;s sandbox from your phone
            (Messaging → Try it out → Send a WhatsApp message), then use the sandbox number as the
            sender. Trial accounts can only message numbers you&apos;ve verified.
          </p>
          <p className="text-muted-foreground">
            For real customers, WhatsApp needs an approved business sender and message templates,
            and SMS in India needs DLT registration with your telecom provider.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
