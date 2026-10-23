it-service-desk/
├── README.md
├── plan.md
├── SECURITY.md
├── LICENSE
├── package.json
├── package-lock.json
├── eslint.config.js
├── .prettierrc.json
├── .gitignore
├── .dockerignore
├── compose.yaml
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   └── pull_request_template.md
│
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── vitest.config.js
│   ├── jsconfig.json
│   ├── .env.example
│   ├── Dockerfile
│   │
│   ├── public/
│   │   ├── favicon.svg
│   │   └── robots.txt
│   │
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       │
│       ├── assets/
│       │   ├── images/
│       │   │   └── logo.svg
│       │   └── fonts/
│       │       └── inter-variable.woff2
│       │
│       ├── styles/
│       │   ├── index.css
│       │   └── theme.css
│       │
│       ├── layouts/
│       │   ├── AuthLayout.jsx
│       │   └── AppLayout.jsx
│       │
│       ├── routes/
│       │   ├── AppRouter.jsx
│       │   ├── ProtectedRoute.jsx
│       │   ├── PermissionRoute.jsx
│       │   └── routePaths.js
│       │
│       ├── navigation/
│       │   ├── sidebarItems.js
│       │   ├── mobileNavItems.js
│       │   └── filterNavigation.js
│       │
│       ├── providers/
│       │   ├── AppProviders.jsx
│       │   ├── AuthProvider.jsx
│       │   └── QueryProvider.jsx
│       │
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── usePermissions.js
│       │   ├── useSidebar.js
│       │   ├── useDebounce.js
│       │   └── useQueryFilters.js
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.jsx
│       │   │   ├── SidebarItem.jsx
│       │   │   ├── SidebarGroup.jsx
│       │   │   ├── SidebarProfile.jsx
│       │   │   ├── OrganizationIdentity.jsx
│       │   │   ├── Header.jsx
│       │   │   ├── MobileDrawer.jsx
│       │   │   ├── MobileBottomNav.jsx
│       │   │   ├── ProfileMenu.jsx
│       │   │   └── Breadcrumbs.jsx
│       │   │
│       │   ├── ui/
│       │   │   ├── Button.jsx
│       │   │   ├── Input.jsx
│       │   │   ├── Select.jsx
│       │   │   ├── Textarea.jsx
│       │   │   ├── Checkbox.jsx
│       │   │   ├── Badge.jsx
│       │   │   ├── Dialog.jsx
│       │   │   ├── ConfirmDialog.jsx
│       │   │   ├── DropdownMenu.jsx
│       │   │   ├── Tabs.jsx
│       │   │   ├── Tooltip.jsx
│       │   │   ├── DataTable.jsx
│       │   │   ├── Pagination.jsx
│       │   │   ├── DateRangePicker.jsx
│       │   │   ├── FileUpload.jsx
│       │   │   ├── Toast.jsx
│       │   │   └── Skeleton.jsx
│       │   │
│       │   └── feedback/
│       │       ├── EmptyState.jsx
│       │       ├── ErrorState.jsx
│       │       ├── ConflictNotice.jsx
│       │       ├── FormError.jsx
│       │       └── ErrorBoundary.jsx
│       │
│       ├── pages/
│       │   ├── shared/
│       │   │   ├── SignInPage.jsx
│       │   │   ├── ActivateAccountPage.jsx
│       │   │   ├── ResetPasswordPage.jsx
│       │   │   ├── HomePage.jsx
│       │   │   ├── TicketDetailPage.jsx
│       │   │   ├── NotificationsPage.jsx
│       │   │   ├── ProfileSecurityPage.jsx
│       │   │   ├── KnowledgeBasePage.jsx
│       │   │   └── KnowledgeArticlePage.jsx
│       │   │
│       │   ├── employee/
│       │   │   ├── MyTicketsPage.jsx
│       │   │   ├── NewTicketPage.jsx
│       │   │   └── MyAssetsPage.jsx
│       │   │
│       │   ├── technician/
│       │   │   └── AssignedWorkPage.jsx
│       │   │
│       │   ├── supervisor/
│       │   │   ├── ApprovalsPage.jsx
│       │   │   └── DepartmentOverviewPage.jsx
│       │   │
│       │   ├── support/
│       │   │   ├── SupportQueuePage.jsx
│       │   │   ├── TriageBoardPage.jsx
│       │   │   ├── AssetRegisterPage.jsx
│       │   │   ├── NewAssetPage.jsx
│       │   │   ├── EditAssetPage.jsx
│       │   │   ├── AssetDetailPage.jsx
│       │   │   ├── AssetImportPage.jsx
│       │   │   ├── ReportsPage.jsx
│       │   │   ├── ExportHistoryPage.jsx
│       │   │   └── KnowledgeEditorPage.jsx
│       │   │
│       │   ├── administrator/
│       │   │   ├── AccountsPage.jsx
│       │   │   ├── ScopeAssignmentsPage.jsx
│       │   │   ├── OrganizationPage.jsx
│       │   │   ├── ServiceCatalogPage.jsx
│       │   │   ├── ServiceLevelsPage.jsx
│       │   │   ├── OrganizationSettingsPage.jsx
│       │   │   ├── AuditExplorerPage.jsx
│       │   │   └── SystemHealthPage.jsx
│       │   │
│       │   └── errors/
│       │       ├── ForbiddenPage.jsx
│       │       ├── NotFoundPage.jsx
│       │       └── ServiceUnavailablePage.jsx
│       │
│       ├── features/
│       │   ├── auth/
│       │   │   ├── auth.api.js
│       │   │   ├── auth.queries.js
│       │   │   ├── SignInForm.jsx
│       │   │   ├── SetPasswordForm.jsx
│       │   │   └── SessionList.jsx
│       │   │
│       │   ├── dashboard/
│       │   │   ├── dashboard.api.js
│       │   │   ├── dashboard.queries.js
│       │   │   ├── EmployeeSummary.jsx
│       │   │   ├── TechnicianSummary.jsx
│       │   │   ├── SupervisorSummary.jsx
│       │   │   ├── AdministratorSummary.jsx
│       │   │   └── SummaryCard.jsx
│       │   │
│       │   ├── tickets/
│       │   │   ├── tickets.api.js
│       │   │   ├── tickets.queries.js
│       │   │   ├── TicketForm.jsx
│       │   │   ├── TicketTable.jsx
│       │   │   ├── TicketFilters.jsx
│       │   │   ├── TicketOverview.jsx
│       │   │   ├── TicketConversation.jsx
│       │   │   ├── CommentComposer.jsx
│       │   │   ├── InternalNoteComposer.jsx
│       │   │   ├── TicketAttachments.jsx
│       │   │   ├── TicketTimeline.jsx
│       │   │   ├── TicketActions.jsx
│       │   │   ├── AssignmentDialog.jsx
│       │   │   ├── ResolutionDialog.jsx
│       │   │   ├── WorklogForm.jsx
│       │   │   ├── ServiceLevelPanel.jsx
│       │   │   └── TicketFeedbackForm.jsx
│       │   │
│       │   ├── approvals/
│       │   │   ├── approvals.api.js
│       │   │   ├── approvals.queries.js
│       │   │   ├── ApprovalTable.jsx
│       │   │   └── ApprovalDecisionDialog.jsx
│       │   │
│       │   ├── assets/
│       │   │   ├── assets.api.js
│       │   │   ├── assets.queries.js
│       │   │   ├── AssetForm.jsx
│       │   │   ├── AssetTable.jsx
│       │   │   ├── AssetFilters.jsx
│       │   │   ├── AssetSnapshot.jsx
│       │   │   ├── CustodyHistory.jsx
│       │   │   ├── AssignAssetDialog.jsx
│       │   │   ├── ReturnAssetDialog.jsx
│       │   │   └── AssetImportPreview.jsx
│       │   │
│       │   ├── notifications/
│       │   │   ├── notifications.api.js
│       │   │   ├── notifications.queries.js
│       │   │   ├── NotificationList.jsx
│       │   │   └── NotificationPopover.jsx
│       │   │
│       │   ├── profile/
│       │   │   ├── profile.api.js
│       │   │   ├── ProfileForm.jsx
│       │   │   └── ChangePasswordForm.jsx
│       │   │
│       │   ├── reports/
│       │   │   ├── reports.api.js
│       │   │   ├── reports.queries.js
│       │   │   ├── ReportFilters.jsx
│       │   │   ├── BacklogChart.jsx
│       │   │   ├── ServiceLevelChart.jsx
│       │   │   └── ExportTable.jsx
│       │   │
│       │   ├── knowledge/
│       │   │   ├── knowledge.api.js
│       │   │   ├── knowledge.queries.js
│       │   │   ├── ArticleCard.jsx
│       │   │   ├── ArticleEditor.jsx
│       │   │   └── ArticleContent.jsx
│       │   │
│       │   └── administration/
│       │       ├── administration.api.js
│       │       ├── administration.queries.js
│       │       ├── UserForm.jsx
│       │       ├── InviteUserDialog.jsx
│       │       ├── AccessGrantForm.jsx
│       │       ├── DepartmentForm.jsx
│       │       ├── LocationForm.jsx
│       │       ├── ServiceCategoryForm.jsx
│       │       ├── ServiceItemForm.jsx
│       │       ├── BusinessCalendarForm.jsx
│       │       ├── SlaPolicyForm.jsx
│       │       ├── PolicyPreview.jsx
│       │       ├── OrganizationSettingsForm.jsx
│       │       ├── AuditTable.jsx
│       │       └── HealthStatusPanel.jsx
│       │
│       ├── lib/
│       │   ├── httpClient.js
│       │   ├── queryClient.js
│       │   ├── queryKeys.js
│       │   └── env.js
│       │
│       ├── utils/
│       │   ├── formatDate.js
│       │   ├── formatDuration.js
│       │   ├── formatCurrency.js
│       │   └── downloadFile.js
│       │
│       └── tests/
│           ├── setup.js
│           ├── Sidebar.test.jsx
│           ├── ProtectedRoute.test.jsx
│           ├── TicketForm.test.jsx
│           └── TicketSearch.test.jsx
│
├── backend/
│   ├── package.json
│   ├── vitest.config.js
│   ├── .env.example
│   ├── Dockerfile
│   │
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── worker.js
│   │   │
│   │   ├── config/
│   │   │   ├── env.js
│   │   │   ├── database.js
│   │   │   ├── session.js
│   │   │   ├── storage.js
│   │   │   ├── mail.js
│   │   │   └── logger.js
│   │   │
│   │   ├── routes/
│   │   │   ├── index.js
│   │   │   └── admin.routes.js
│   │   │
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── authorize.js
│   │   │   ├── validateRequest.js
│   │   │   ├── csrfProtection.js
│   │   │   ├── validateOrigin.js
│   │   │   ├── rateLimit.js
│   │   │   ├── requestId.js
│   │   │   ├── upload.js
│   │   │   ├── idempotency.js
│   │   │   ├── notFound.js
│   │   │   └── errorHandler.js
│   │   │
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.service.js
│   │   │   │   ├── session.service.js
│   │   │   │   ├── session.model.js
│   │   │   │   ├── accountToken.model.js
│   │   │   │   └── password.service.js
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── users.routes.js
│   │   │   │   ├── users.controller.js
│   │   │   │   ├── users.service.js
│   │   │   │   ├── user.model.js
│   │   │   │   ├── user.policy.js
│   │   │   │   └── user.serializer.js
│   │   │   │
│   │   │   ├── access/
│   │   │   │   ├── access.routes.js
│   │   │   │   ├── access.controller.js
│   │   │   │   ├── access.service.js
│   │   │   │   ├── accessGrant.model.js
│   │   │   │   └── scopeFilters.js
│   │   │   │
│   │   │   ├── organization/
│   │   │   │   ├── organization.routes.js
│   │   │   │   ├── organization.controller.js
│   │   │   │   ├── organization.service.js
│   │   │   │   ├── organization.model.js
│   │   │   │   ├── department.model.js
│   │   │   │   └── location.model.js
│   │   │   │
│   │   │   ├── catalog/
│   │   │   │   ├── catalog.routes.js
│   │   │   │   ├── catalog.controller.js
│   │   │   │   ├── catalog.service.js
│   │   │   │   ├── serviceCategory.model.js
│   │   │   │   └── serviceItem.model.js
│   │   │   │
│   │   │   ├── tickets/
│   │   │   │   ├── tickets.routes.js
│   │   │   │   ├── tickets.controller.js
│   │   │   │   ├── tickets.service.js
│   │   │   │   ├── ticket.model.js
│   │   │   │   ├── ticketEvent.model.js
│   │   │   │   ├── ticketAsset.schema.js
│   │   │   │   ├── ticket.policy.js
│   │   │   │   ├── ticket.serializer.js
│   │   │   │   ├── ticketTransitions.js
│   │   │   │   ├── ticketPriority.js
│   │   │   │   ├── ticketAssignment.service.js
│   │   │   │   └── ticketResolution.service.js
│   │   │   │
│   │   │   ├── comments/
│   │   │   │   ├── comments.routes.js
│   │   │   │   ├── comments.controller.js
│   │   │   │   ├── comments.service.js
│   │   │   │   ├── comment.model.js
│   │   │   │   └── comment.policy.js
│   │   │   │
│   │   │   ├── attachments/
│   │   │   │   ├── attachments.routes.js
│   │   │   │   ├── attachments.controller.js
│   │   │   │   ├── attachments.service.js
│   │   │   │   ├── attachment.model.js
│   │   │   │   ├── attachment.policy.js
│   │   │   │   └── fileValidation.js
│   │   │   │
│   │   │   ├── worklogs/
│   │   │   │   ├── worklogs.routes.js
│   │   │   │   ├── worklogs.controller.js
│   │   │   │   ├── worklogs.service.js
│   │   │   │   └── worklog.model.js
│   │   │   │
│   │   │   ├── approvals/
│   │   │   │   ├── approvals.routes.js
│   │   │   │   ├── approvals.controller.js
│   │   │   │   ├── approvals.service.js
│   │   │   │   ├── approval.model.js
│   │   │   │   └── approval.policy.js
│   │   │   │
│   │   │   ├── assets/
│   │   │   │   ├── assets.routes.js
│   │   │   │   ├── assets.controller.js
│   │   │   │   ├── assets.service.js
│   │   │   │   ├── asset.model.js
│   │   │   │   ├── assetAssignment.model.js
│   │   │   │   ├── assetEvent.model.js
│   │   │   │   ├── asset.policy.js
│   │   │   │   ├── asset.serializer.js
│   │   │   │   ├── assetCustody.service.js
│   │   │   │   ├── assetImport.service.js
│   │   │   │   └── importBatch.model.js
│   │   │   │
│   │   │   ├── service-levels/
│   │   │   │   ├── serviceLevels.routes.js
│   │   │   │   ├── serviceLevels.controller.js
│   │   │   │   ├── serviceLevels.service.js
│   │   │   │   ├── businessCalendar.model.js
│   │   │   │   ├── weeklyWindow.schema.js
│   │   │   │   ├── holiday.schema.js
│   │   │   │   ├── slaPolicy.model.js
│   │   │   │   ├── slaTarget.schema.js
│   │   │   │   ├── slaCycle.model.js
│   │   │   │   ├── slaPause.model.js
│   │   │   │   ├── slaBreach.model.js
│   │   │   │   ├── businessTime.js
│   │   │   │   └── slaClock.service.js
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.routes.js
│   │   │   │   ├── dashboard.controller.js
│   │   │   │   └── dashboard.service.js
│   │   │   │
│   │   │   ├── reports/
│   │   │   │   ├── reports.routes.js
│   │   │   │   ├── reports.controller.js
│   │   │   │   ├── reports.service.js
│   │   │   │   ├── export.service.js
│   │   │   │   └── exportJob.model.js
│   │   │   │
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.routes.js
│   │   │   │   ├── notifications.controller.js
│   │   │   │   ├── notifications.service.js
│   │   │   │   ├── notification.model.js
│   │   │   │   └── notification.policy.js
│   │   │   │
│   │   │   ├── knowledge/
│   │   │   │   ├── knowledge.routes.js
│   │   │   │   ├── knowledge.controller.js
│   │   │   │   ├── knowledge.service.js
│   │   │   │   ├── knowledgeArticle.model.js
│   │   │   │   ├── knowledge.policy.js
│   │   │   │   └── sanitizeArticle.js
│   │   │   │
│   │   │   ├── feedback/
│   │   │   │   ├── feedback.routes.js
│   │   │   │   ├── feedback.controller.js
│   │   │   │   ├── feedback.service.js
│   │   │   │   └── ticketFeedback.model.js
│   │   │   │
│   │   │   ├── audit/
│   │   │   │   ├── audit.routes.js
│   │   │   │   ├── audit.controller.js
│   │   │   │   ├── audit.service.js
│   │   │   │   ├── auditEvent.model.js
│   │   │   │   └── redactMetadata.js
│   │   │   │
│   │   │   ├── outbox/
│   │   │   │   ├── outboxEvent.model.js
│   │   │   │   ├── outbox.service.js
│   │   │   │   └── outboxLease.service.js
│   │   │   │
│   │   │   └── health/
│   │   │       ├── health.routes.js
│   │   │       ├── health.controller.js
│   │   │       ├── health.service.js
│   │   │       └── workerHeartbeat.model.js
│   │   │
│   │   ├── database/
│   │   │   ├── withTransaction.js
│   │   │   ├── createIndexes.js
│   │   │   ├── referenceCounter.model.js
│   │   │   ├── referenceCounter.service.js
│   │   │   ├── idempotencyKey.model.js
│   │   │   └── migrations/
│   │   │       ├── migrate.js
│   │   │       ├── migrationRecord.model.js
│   │   │       ├── 001-create-collections.js
│   │   │       └── 002-create-indexes.js
│   │   │
│   │   ├── workers/
│   │   │   ├── scheduler.js
│   │   │   ├── outbox.processor.js
│   │   │   ├── notification.processor.js
│   │   │   ├── email.processor.js
│   │   │   ├── sla.processor.js
│   │   │   ├── export.processor.js
│   │   │   ├── malwareScan.processor.js
│   │   │   ├── cleanup.processor.js
│   │   │   └── heartbeat.js
│   │   │
│   │   ├── adapters/
│   │   │   ├── storage/
│   │   │   │   └── localStorage.adapter.js
│   │   │   ├── mail/
│   │   │   │   └── smtp.adapter.js
│   │   │   └── scanning/
│   │   │       ├── disabledScanner.adapter.js
│   │   │       └── clamav.adapter.js
│   │   │
│   │   ├── templates/
│   │   │   └── emails/
│   │   │       ├── account-invitation.hbs
│   │   │       ├── password-reset.hbs
│   │   │       └── ticket-update.hbs
│   │   │
│   │   └── utils/
│   │       ├── AppError.js
│   │       ├── asyncHandler.js
│   │       ├── apiResponse.js
│   │       ├── pagination.js
│   │       ├── hashToken.js
│   │       ├── generateToken.js
│   │       ├── checksum.js
│   │       └── safeCsv.js
│   │
│   ├── scripts/
│   │   ├── bootstrap-admin.js
│   │   ├── seed-demo.js
│   │   └── fixtures/
│   │       ├── organization.js
│   │       ├── departments.js
│   │       ├── locations.js
│   │       ├── users.js
│   │       ├── access-grants.js
│   │       ├── catalog.js
│   │       ├── service-levels.js
│   │       ├── tickets.js
│   │       ├── assets.js
│   │       └── knowledge.js
│   │
│   └── tests/
│       ├── setup.js
│       ├── helpers/
│       │   ├── testDatabase.js
│       │   ├── testSession.js
│       │   └── factories.js
│       ├── unit/
│       │   ├── ticketPriority.test.js
│       │   ├── ticketTransitions.test.js
│       │   ├── businessTime.test.js
│       │   └── safeCsv.test.js
│       └── integration/
│           ├── auth.test.js
│           ├── sessionRevocation.test.js
│           ├── scopeAuthorization.test.js
│           ├── ticketWorkflow.test.js
│           ├── ticketClaimConcurrency.test.js
│           ├── internalNoteVisibility.test.js
│           ├── attachmentAccess.test.js
│           ├── approvalConcurrency.test.js
│           ├── assetCustodyConcurrency.test.js
│           ├── slaSnapshots.test.js
│           ├── idempotency.test.js
│           ├── outboxRecovery.test.js
│           ├── scopedReports.test.js
│           ├── exportAuthorization.test.js
│           └── lastAdministrator.test.js
│
├── packages/
│   └── contracts/
│       ├── package.json
│       └── src/
│           ├── index.js
│           ├── constants/
│           │   ├── roles.js
│           │   ├── capabilities.js
│           │   ├── ticketStatuses.js
│           │   ├── priorities.js
│           │   └── assetStatuses.js
│           └── schemas/
│               ├── auth.schema.js
│               ├── profile.schema.js
│               ├── user.schema.js
│               ├── accessGrant.schema.js
│               ├── organization.schema.js
│               ├── catalog.schema.js
│               ├── ticket.schema.js
│               ├── comment.schema.js
│               ├── worklog.schema.js
│               ├── approval.schema.js
│               ├── asset.schema.js
│               ├── serviceLevel.schema.js
│               ├── report.schema.js
│               ├── knowledge.schema.js
│               └── feedback.schema.js
│
├── tests/
│   └── e2e/
│       ├── playwright.config.js
│       ├── auth.setup.js
│       ├── employee-ticket-journey.spec.js
│       ├── technician-workflow.spec.js
│       ├── supervisor-approval.spec.js
│       ├── administrator-accounts.spec.js
│       ├── asset-assignment-return.spec.js
│       ├── permission-boundaries.spec.js
│       └── mobile-navigation.spec.js
│
├── infrastructure/
│   ├── nginx/
│   │   └── default.conf
│   ├── mongodb/
│   │   ├── mongod.conf
│   │   └── init-replica-set.js
│   └── scripts/
│       ├── backup.sh
│       ├── restore.sh
│       └── verify-backup.sh
│
├── private-storage/
│   ├── .gitignore
│   ├── attachments/
│   │   └── .gitkeep
│   ├── temporary/
│   │   └── .gitkeep
│   └── exports/
│       └── .gitkeep
│
└── docs/
    ├── architecture.md
    ├── mongodb-data-model.md
    ├── roles-and-permissions.md
    ├── routes.md
    ├── ticket-workflows.md
    ├── sla-calculations.md
    ├── api.openapi.yaml
    ├── setup.md
    ├── deployment.md
    ├── backup-and-restore.md
    ├── testing.md
    ├── demo-guide.md
    ├── roadmap.md
    └── screenshots/
        └── .gitkeep