from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QSplitter,
    QStatusBar,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from cloudsprocket.config import APP_DESCRIPTION, AppSettings
from cloudsprocket.models import (
    AuthMethodStatus,
    DetailField,
    LogEntry,
    ProfileDetails,
    ProviderAction,
    ProviderHealth,
)
from cloudsprocket.services.app_controller import CloudSprocketController


class MainWindow(QMainWindow):
    def __init__(
        self,
        *,
        settings: AppSettings,
        controller: CloudSprocketController,
    ) -> None:
        super().__init__()
        self._settings = settings
        self._controller = controller

        self._provider_tree = QTreeWidget()
        self._profile_tree = QTreeWidget()
        self._detail_fields_tree = QTreeWidget()
        self._auth_methods_tree = QTreeWidget()
        self._capabilities_tree = QTreeWidget()
        self._log_panel = QPlainTextEdit()
        self._detail_title = QLabel()
        self._detail_subtitle = QLabel()
        self._detail_summary = QLabel()
        self._detail_sources = QLabel()
        self._detail_notes = QLabel()
        self._config_label = QLabel()
        self._status_bar = QStatusBar()
        self._action_buttons: dict[str, QPushButton] = {}
        self._reveal_sensitive_button = QPushButton("Reveal Sensitive Values")
        self._show_sensitive_values = False
        self._actions_hint_label = QLabel()
        self._profile_actions_label = QLabel()
        self._global_actions_label = QLabel()

        self.setWindowTitle(settings.app_brand_name)
        self.resize(1360, 860)
        self.setStatusBar(self._status_bar)

        self._build_ui()
        self._controller.state_changed.connect(self.render_state)
        self.render_state()

    @property
    def provider_tree(self) -> QTreeWidget:
        return self._provider_tree

    @property
    def profile_tree(self) -> QTreeWidget:
        return self._profile_tree

    @property
    def log_panel(self) -> QPlainTextEdit:
        return self._log_panel

    @property
    def detail_fields_tree(self) -> QTreeWidget:
        return self._detail_fields_tree

    @property
    def detail_title_label(self) -> QLabel:
        return self._detail_title

    @property
    def auth_methods_tree(self) -> QTreeWidget:
        return self._auth_methods_tree

    @property
    def reveal_sensitive_button(self) -> QPushButton:
        return self._reveal_sensitive_button

    @property
    def action_buttons(self) -> dict[str, QPushButton]:
        return self._action_buttons

    @property
    def actions_hint_label(self) -> QLabel:
        return self._actions_hint_label

    @property
    def profile_actions_label(self) -> QLabel:
        return self._profile_actions_label

    @property
    def global_actions_label(self) -> QLabel:
        return self._global_actions_label

    @property
    def profile_actions_container(self) -> QWidget:
        return self._profile_actions_container

    @property
    def global_actions_container(self) -> QWidget:
        return self._global_actions_container

    def about_text(self) -> str:
        return self._controller.about_text()

    def render_state(self) -> None:
        self._config_label.setText(f"Config root: {self._settings.config_dir}")
        self._render_provider_snapshot(self._controller.provider_snapshot)
        self._render_profile_list()
        self._render_profile_details(self._controller.selected_profile_details())
        self._render_actions(self._controller.available_actions())
        self._render_logs(self._controller.log_entries())
        self._status_bar.showMessage(self._controller.status_message())

    def _build_ui(self) -> None:
        refresh_action = QAction("Refresh", self)
        refresh_action.triggered.connect(lambda: self._controller.trigger_action("refresh"))
        about_action = QAction("About", self)
        about_action.triggered.connect(self._show_about_dialog)

        menu_bar = self.menuBar()
        menu_bar.addAction(refresh_action)
        menu_bar.addAction(about_action)

        central = QWidget(self)
        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(24, 24, 24, 24)
        root_layout.setSpacing(16)

        root_layout.addLayout(self._build_header())
        root_layout.addWidget(self._build_body(), 1)

        self.setCentralWidget(central)

    def _build_header(self) -> QHBoxLayout:
        title = QLabel(self._settings.app_brand_name)
        title.setObjectName("title")
        title.setStyleSheet("font-size: 30px; font-weight: 700;")

        subtitle = QLabel(APP_DESCRIPTION)
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("color: #5f6b7a; font-size: 14px;")

        byline = QLabel(f"Created by {self._settings.author_name}")
        byline.setStyleSheet("color: #2b4f73; font-size: 13px; font-weight: 600;")

        self._config_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._config_label.setStyleSheet(
            "padding: 8px 12px; background: #eef3f8; border-radius: 8px;"
        )

        refresh_button = QPushButton("Refresh Snapshot")
        refresh_button.clicked.connect(lambda: self._controller.trigger_action("refresh"))
        refresh_button.setFixedWidth(160)

        header_text = QVBoxLayout()
        header_text.addWidget(title)
        header_text.addWidget(subtitle)
        header_text.addWidget(byline)
        header_text.addWidget(self._config_label)

        layout = QHBoxLayout()
        layout.addLayout(header_text, 1)
        layout.addWidget(refresh_button, 0, Qt.AlignTop)
        return layout

    def _build_body(self) -> QSplitter:
        navigation_splitter = QSplitter(Qt.Vertical)
        navigation_splitter.setChildrenCollapsible(False)
        navigation_splitter.addWidget(self._build_provider_panel())
        navigation_splitter.addWidget(self._build_profile_panel())
        navigation_splitter.setStretchFactor(0, 2)
        navigation_splitter.setStretchFactor(1, 3)

        detail_tabs = QTabWidget()
        detail_tabs.setDocumentMode(True)
        detail_tabs.addTab(self._build_overview_tab(), "Overview")
        detail_tabs.addTab(self._build_access_tab(), "Access")
        detail_tabs.addTab(self._build_actions_tab(), "Actions")

        content_splitter = QSplitter(Qt.Vertical)
        content_splitter.setChildrenCollapsible(False)
        content_splitter.addWidget(detail_tabs)
        content_splitter.addWidget(self._build_log_panel())
        content_splitter.setStretchFactor(0, 5)
        content_splitter.setStretchFactor(1, 2)

        body_splitter = QSplitter(Qt.Horizontal)
        body_splitter.setChildrenCollapsible(False)
        body_splitter.addWidget(navigation_splitter)
        body_splitter.addWidget(content_splitter)
        body_splitter.setStretchFactor(0, 2)
        body_splitter.setStretchFactor(1, 5)
        body_splitter.setSizes([360, 980])
        return body_splitter

    def _build_provider_panel(self) -> QGroupBox:
        group = QGroupBox("Provider Summary")
        layout = QVBoxLayout(group)
        self._provider_tree.setColumnCount(3)
        self._provider_tree.setHeaderLabels(["Provider", "State", "Summary"])
        self._configure_data_tree(self._provider_tree)
        self._provider_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._provider_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._provider_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        self._provider_tree.itemSelectionChanged.connect(self._on_provider_selection_changed)
        layout.addWidget(self._provider_tree)
        return group

    def _build_profile_panel(self) -> QGroupBox:
        group = QGroupBox("Discovered Profiles")
        layout = QVBoxLayout(group)
        self._profile_tree.setColumnCount(4)
        self._profile_tree.setHeaderLabels(["Provider", "Profile", "Source", "Details"])
        self._configure_data_tree(self._profile_tree)
        self._profile_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(3, QHeaderView.Stretch)
        self._profile_tree.itemSelectionChanged.connect(self._on_profile_selection_changed)
        layout.addWidget(self._profile_tree)
        return group

    def _build_overview_tab(self) -> QWidget:
        content = QWidget()
        layout = QVBoxLayout(content)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)
        layout.addWidget(self._build_details_panel())
        layout.addStretch(1)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.NoFrame)
        scroll.setWidget(content)
        return scroll

    def _build_access_tab(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        access_splitter = QSplitter(Qt.Vertical)
        access_splitter.setChildrenCollapsible(False)
        access_splitter.addWidget(self._build_auth_methods_panel())
        access_splitter.addWidget(self._build_capabilities_panel())
        access_splitter.setStretchFactor(0, 1)
        access_splitter.setStretchFactor(1, 1)

        layout.addWidget(access_splitter)
        return panel

    def _build_actions_tab(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._build_actions_panel())
        return panel

    def _build_details_panel(self) -> QGroupBox:
        group = QGroupBox("Selected Profile")
        layout = QVBoxLayout(group)
        self._detail_title.setStyleSheet("font-size: 22px; font-weight: 700;")
        self._detail_subtitle.setStyleSheet("color: #2b4f73; font-size: 13px;")
        self._detail_summary.setWordWrap(True)
        self._detail_sources.setWordWrap(True)
        self._detail_sources.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._detail_sources.setStyleSheet(
            "padding: 10px 12px; background: #f4f7fa; border-radius: 8px; color: #2a3a4a;"
        )
        self._detail_notes.setWordWrap(True)
        self._detail_notes.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._detail_notes.setStyleSheet(
            "padding: 10px 12px; background: #f7f8fb; border-radius: 8px; color: #4f6172;"
        )
        self._reveal_sensitive_button.setCheckable(True)
        self._reveal_sensitive_button.setEnabled(False)
        self._reveal_sensitive_button.toggled.connect(self._on_sensitive_visibility_toggled)
        self._detail_fields_tree.setColumnCount(2)
        self._detail_fields_tree.setHeaderLabels(["Setting", "Value"])
        self._configure_data_tree(self._detail_fields_tree)
        self._detail_fields_tree.setUniformRowHeights(False)
        self._detail_fields_tree.setWordWrap(True)
        self._detail_fields_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._detail_fields_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._detail_fields_tree.setMinimumHeight(320)

        heading_layout = QHBoxLayout()
        heading_layout.addWidget(self._detail_title, 1)
        heading_layout.addWidget(self._reveal_sensitive_button, 0, Qt.AlignTop)

        sources_group = QGroupBox("Source Paths")
        sources_layout = QVBoxLayout(sources_group)
        sources_layout.addWidget(self._detail_sources)

        fields_group = QGroupBox("Discovered Fields")
        fields_layout = QVBoxLayout(fields_group)
        fields_layout.addWidget(self._detail_fields_tree)

        notes_group = QGroupBox("Notes")
        notes_layout = QVBoxLayout(notes_group)
        notes_layout.addWidget(self._detail_notes)

        layout.addLayout(heading_layout)
        layout.addWidget(self._detail_subtitle)
        layout.addWidget(self._detail_summary)
        layout.addWidget(sources_group)
        layout.addWidget(fields_group, 1)
        layout.addWidget(notes_group)
        return group

    def _build_auth_methods_panel(self) -> QGroupBox:
        group = QGroupBox("Auth Methods")
        layout = QVBoxLayout(group)
        self._auth_methods_tree.setColumnCount(3)
        self._auth_methods_tree.setHeaderLabels(["Method", "Status", "Summary"])
        self._configure_data_tree(self._auth_methods_tree)
        self._auth_methods_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._auth_methods_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._auth_methods_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        layout.addWidget(self._auth_methods_tree)
        return group

    def _build_capabilities_panel(self) -> QGroupBox:
        group = QGroupBox("Capabilities")
        layout = QVBoxLayout(group)
        self._capabilities_tree.setColumnCount(3)
        self._capabilities_tree.setHeaderLabels(["Capability", "Status", "Summary"])
        self._configure_data_tree(self._capabilities_tree)
        self._capabilities_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._capabilities_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._capabilities_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        layout.addWidget(self._capabilities_tree)
        return group

    def _build_actions_panel(self) -> QGroupBox:
        group = QGroupBox("Actions")
        layout = QVBoxLayout(group)
        self._actions_hint_label.setWordWrap(True)
        self._actions_hint_label.setStyleSheet(
            "padding: 10px 12px; background: #f4f7fa; border-radius: 8px; color: #4f6172;"
        )
        self._profile_actions_label.setStyleSheet(
            "font-size: 13px; font-weight: 700; color: #2b4f73; padding-top: 4px;"
        )
        self._global_actions_label.setStyleSheet(
            "font-size: 13px; font-weight: 700; color: #2b4f73; padding-top: 4px;"
        )

        self._profile_actions_container = QWidget(group)
        self._profile_actions_layout = QGridLayout(self._profile_actions_container)
        self._profile_actions_layout.setContentsMargins(0, 0, 0, 0)
        self._profile_actions_layout.setHorizontalSpacing(8)
        self._profile_actions_layout.setVerticalSpacing(8)

        self._global_actions_container = QWidget(group)
        self._global_actions_layout = QGridLayout(self._global_actions_container)
        self._global_actions_layout.setContentsMargins(0, 0, 0, 0)
        self._global_actions_layout.setHorizontalSpacing(8)
        self._global_actions_layout.setVerticalSpacing(8)

        layout.addWidget(self._actions_hint_label)
        layout.addWidget(self._profile_actions_label)
        layout.addWidget(self._profile_actions_container)
        layout.addWidget(self._global_actions_label)
        layout.addWidget(self._global_actions_container)
        return group

    def _build_log_panel(self) -> QGroupBox:
        group = QGroupBox("Activity Log")
        layout = QVBoxLayout(group)
        self._log_panel.setReadOnly(True)
        self._log_panel.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self._log_panel.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self._log_panel.setCenterOnScroll(False)
        self._log_panel.setLineWrapMode(QPlainTextEdit.WidgetWidth)
        self._log_panel.setPlaceholderText("Command output and action history will appear here.")
        layout.addWidget(self._log_panel)
        return group

    def _render_provider_snapshot(self, snapshot: tuple[ProviderHealth, ...]) -> None:
        selected_provider_id = self._controller.current_provider_id()
        self._provider_tree.blockSignals(True)
        self._provider_tree.clear()
        selected_item: QTreeWidgetItem | None = None
        for provider in snapshot:
            item = QTreeWidgetItem([provider.label, provider.state.value, provider.summary])
            item.setData(0, Qt.UserRole, provider.provider_id)
            tooltip_lines = [str(path) for path in provider.locations]
            if provider.command_path:
                tooltip_lines.append(f"CLI: {provider.command_path}")
            if tooltip_lines:
                item.setToolTip(2, "\n".join(tooltip_lines))
            self._provider_tree.addTopLevelItem(item)
            if provider.provider_id == selected_provider_id:
                selected_item = item
        self._provider_tree.resizeColumnToContents(0)
        self._provider_tree.resizeColumnToContents(1)
        if selected_item is not None:
            selected_item.setSelected(True)
            self._provider_tree.setCurrentItem(selected_item)
        self._provider_tree.blockSignals(False)

    def _render_profile_list(self) -> None:
        current_provider_id = self._controller.current_provider_id()
        selected_profile = self._controller.selected_profile()
        selected_profile_id = selected_profile.profile_id if selected_profile else None
        profiles = self._controller.profiles_for_provider(current_provider_id)

        self._profile_tree.blockSignals(True)
        self._profile_tree.clear()
        selected_item: QTreeWidgetItem | None = None
        active_profile_id = self._controller.session_state.active_profile_id(current_provider_id or "")
        for profile in profiles:
            display_name = profile.display_name
            if active_profile_id == profile.profile_id:
                display_name = f"{display_name} (active)"
            item = QTreeWidgetItem(
                [
                    profile.provider_id.upper(),
                    display_name,
                    str(profile.source),
                    profile.details,
                ]
            )
            item.setData(0, Qt.UserRole, profile.provider_id)
            item.setData(1, Qt.UserRole, profile.profile_id)
            item.setToolTip(2, "\n".join(str(path) for path in (profile.source_paths or (profile.source,))))
            self._profile_tree.addTopLevelItem(item)
            if profile.profile_id == selected_profile_id:
                selected_item = item
        self._profile_tree.resizeColumnToContents(0)
        self._profile_tree.resizeColumnToContents(1)
        if selected_item is not None:
            selected_item.setSelected(True)
            self._profile_tree.setCurrentItem(selected_item)
        self._profile_tree.blockSignals(False)

    def _render_profile_details(self, details: ProfileDetails) -> None:
        self._detail_title.setText(details.title)
        self._detail_subtitle.setText(details.subtitle)
        self._detail_summary.setText(details.summary)
        has_sensitive_fields = any(field.sensitive for field in details.detail_fields)
        if not has_sensitive_fields:
            self._set_sensitive_visibility(False)
        self._reveal_sensitive_button.setEnabled(has_sensitive_fields)
        if details.source_paths:
            self._detail_sources.setText("\n".join(str(path) for path in details.source_paths))
        else:
            self._detail_sources.setText("No source paths were reported for this profile.")
        self._detail_notes.setText(
            "\n".join(details.notes) if details.notes else "No additional notes for this profile."
        )

        self._detail_fields_tree.clear()
        for field in details.detail_fields:
            field_value = self._display_field_value(field)
            item = QTreeWidgetItem([field.label, field_value])
            item.setToolTip(0, field.label)
            if field.sensitive and not self._show_sensitive_values:
                item.setToolTip(1, "Sensitive value hidden. Use Reveal Sensitive Values to display it.")
            else:
                item.setToolTip(1, field.value)
            self._detail_fields_tree.addTopLevelItem(item)
        self._detail_fields_tree.resizeColumnToContents(0)

        self._auth_methods_tree.clear()
        for method in details.auth_methods:
            self._auth_methods_tree.addTopLevelItem(self._auth_method_item(method))
        self._auth_methods_tree.resizeColumnToContents(0)
        self._auth_methods_tree.resizeColumnToContents(1)

        self._capabilities_tree.clear()
        for capability in details.capabilities:
            status = "available" if capability.available else "pending"
            self._capabilities_tree.addTopLevelItem(
                QTreeWidgetItem([capability.label, status, capability.summary])
            )
        self._capabilities_tree.resizeColumnToContents(0)
        self._capabilities_tree.resizeColumnToContents(1)

    def _render_actions(self, actions: tuple[ProviderAction, ...]) -> None:
        self._action_buttons = {}
        busy = self._controller.session_state.command_state.value == "running"
        selected_profile = self._controller.selected_profile()
        selected_profile_actions = tuple(action for action in actions if action.requires_profile)
        global_actions = tuple(action for action in actions if not action.requires_profile)

        self._clear_action_layout(self._profile_actions_layout)
        self._clear_action_layout(self._global_actions_layout)
        self._actions_hint_label.setText(
            "Selected profile actions only affect the chosen profile. "
            "Provider-wide actions affect shared CLI session state or configuration."
        )
        if selected_profile is not None:
            self._profile_actions_label.setText(
                f"Selected Profile Actions: {selected_profile.display_name}"
            )
        else:
            self._profile_actions_label.setText("Selected Profile Actions")
        self._global_actions_label.setText("Provider-wide Actions")
        self._profile_actions_label.setVisible(bool(selected_profile_actions))
        self._profile_actions_container.setVisible(bool(selected_profile_actions))
        self._global_actions_label.setVisible(bool(global_actions))
        self._global_actions_container.setVisible(bool(global_actions))

        for layout, grouped_actions in (
            (self._profile_actions_layout, selected_profile_actions),
            (self._global_actions_layout, global_actions),
        ):
            for index, action in enumerate(grouped_actions):
                button = self._render_action_button(action, busy=busy)
                row, column = divmod(index, 2)
                layout.addWidget(button, row, column)
                self._action_buttons[action.action_id] = button

    def _clear_action_layout(self, layout: QGridLayout) -> None:
        while layout.count():
            child = layout.takeAt(0)
            widget = child.widget()
            if widget is not None:
                widget.deleteLater()

    def _render_action_button(self, action: ProviderAction, *, busy: bool) -> QPushButton:
        button = QPushButton(action.label)
        button.setObjectName(f"action-{action.action_id}")
        button.clicked.connect(
            lambda _checked=False, action_id=action.action_id: self._controller.trigger_action(action_id)
        )
        button.setEnabled(action.enabled and not busy)
        tooltip = action.description
        if not action.enabled and action.disabled_reason:
            tooltip = f"{action.description}\n{action.disabled_reason}".strip()
        button.setToolTip(tooltip)
        return button

    def _render_logs(self, entries: tuple[LogEntry, ...] | list[LogEntry]) -> None:
        lines = []
        for entry in entries:
            header = f"[{entry.level.upper()}]"
            if entry.action_id:
                header += f" {entry.action_id}"
            lines.append(f"{header} {entry.message}")
            if entry.details:
                lines.append(entry.details)
                lines.append("")
        self._log_panel.setPlainText("\n".join(lines).strip())
        self._log_panel.verticalScrollBar().setValue(self._log_panel.verticalScrollBar().maximum())

    def _auth_method_item(self, method: AuthMethodStatus) -> QTreeWidgetItem:
        status = "available" if method.available else "unavailable"
        return QTreeWidgetItem([method.label, status, method.summary])

    def _on_provider_selection_changed(self) -> None:
        item = self._provider_tree.currentItem()
        if item is None:
            return
        provider_id = item.data(0, Qt.UserRole)
        if provider_id:
            self._set_sensitive_visibility(False)
            self._controller.set_current_provider(provider_id)

    def _on_profile_selection_changed(self) -> None:
        item = self._profile_tree.currentItem()
        if item is None:
            return
        provider_id = item.data(0, Qt.UserRole)
        profile_id = item.data(1, Qt.UserRole)
        if provider_id and profile_id:
            self._set_sensitive_visibility(False)
            self._controller.select_profile(provider_id, profile_id)

    def _show_about_dialog(self) -> None:
        QMessageBox.about(self, "About CloudSprocket", self.about_text())

    def _display_field_value(self, field: DetailField) -> str:
        if field.sensitive and not self._show_sensitive_values:
            return "Hidden until revealed"
        return field.value

    def _on_sensitive_visibility_toggled(self, checked: bool) -> None:
        self._show_sensitive_values = checked
        self._sync_sensitive_button_label()
        self._render_profile_details(self._controller.selected_profile_details())

    def _set_sensitive_visibility(self, visible: bool) -> None:
        self._show_sensitive_values = visible
        self._reveal_sensitive_button.blockSignals(True)
        self._reveal_sensitive_button.setChecked(visible)
        self._reveal_sensitive_button.blockSignals(False)
        self._sync_sensitive_button_label()

    def _sync_sensitive_button_label(self) -> None:
        self._reveal_sensitive_button.setText(
            "Hide Sensitive Values" if self._show_sensitive_values else "Reveal Sensitive Values"
        )

    def _configure_data_tree(self, tree: QTreeWidget) -> None:
        tree.setRootIsDecorated(False)
        tree.setAlternatingRowColors(True)
        tree.setUniformRowHeights(True)
        tree.setIndentation(0)
        tree.setAllColumnsShowFocus(True)
        tree.setSelectionBehavior(QAbstractItemView.SelectRows)
        tree.setSelectionMode(QAbstractItemView.SingleSelection)
        tree.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        tree.setHorizontalScrollMode(QAbstractItemView.ScrollPerPixel)
