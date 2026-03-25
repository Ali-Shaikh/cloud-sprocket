from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QStatusBar,
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
        self._detail_notes = QLabel()
        self._config_label = QLabel()
        self._status_bar = QStatusBar()
        self._action_buttons: dict[str, QPushButton] = {}
        self._reveal_sensitive_button = QPushButton("Reveal Sensitive Values")
        self._show_sensitive_values = False

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
        root_layout.addLayout(self._build_body(), 1)
        root_layout.addWidget(self._build_log_panel(), 1)

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

    def _build_body(self) -> QHBoxLayout:
        layout = QHBoxLayout()
        layout.setSpacing(16)
        layout.addWidget(self._build_provider_panel(), 1)
        layout.addWidget(self._build_profile_panel(), 1)
        layout.addLayout(self._build_details_column(), 3)
        return layout

    def _build_provider_panel(self) -> QGroupBox:
        group = QGroupBox("Provider Summary")
        layout = QVBoxLayout(group)
        self._provider_tree.setColumnCount(3)
        self._provider_tree.setHeaderLabels(["Provider", "State", "Summary"])
        self._provider_tree.setRootIsDecorated(False)
        self._provider_tree.setAlternatingRowColors(True)
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
        self._profile_tree.setRootIsDecorated(False)
        self._profile_tree.setAlternatingRowColors(True)
        self._profile_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(3, QHeaderView.Stretch)
        self._profile_tree.itemSelectionChanged.connect(self._on_profile_selection_changed)
        layout.addWidget(self._profile_tree)
        return group

    def _build_details_column(self) -> QVBoxLayout:
        layout = QVBoxLayout()
        layout.setSpacing(16)
        layout.addWidget(self._build_details_panel(), 2)
        layout.addWidget(self._build_auth_methods_panel(), 1)
        layout.addWidget(self._build_capabilities_panel(), 1)
        layout.addWidget(self._build_actions_panel(), 1)
        return layout

    def _build_details_panel(self) -> QGroupBox:
        group = QGroupBox("Selected Profile")
        layout = QVBoxLayout(group)
        self._detail_title.setStyleSheet("font-size: 22px; font-weight: 700;")
        self._detail_subtitle.setStyleSheet("color: #2b4f73; font-size: 13px;")
        self._detail_summary.setWordWrap(True)
        self._detail_notes.setWordWrap(True)
        self._detail_notes.setStyleSheet("color: #4f6172;")
        self._reveal_sensitive_button.setCheckable(True)
        self._reveal_sensitive_button.setEnabled(False)
        self._reveal_sensitive_button.toggled.connect(self._on_sensitive_visibility_toggled)
        self._detail_fields_tree.setColumnCount(2)
        self._detail_fields_tree.setHeaderLabels(["Field", "Value"])
        self._detail_fields_tree.setRootIsDecorated(False)
        self._detail_fields_tree.setAlternatingRowColors(True)
        self._detail_fields_tree.setWordWrap(True)
        self._detail_fields_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._detail_fields_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._detail_fields_tree.setMinimumHeight(240)

        heading_layout = QHBoxLayout()
        heading_layout.addWidget(self._detail_title, 1)
        heading_layout.addWidget(self._reveal_sensitive_button, 0, Qt.AlignTop)

        layout.addLayout(heading_layout)
        layout.addWidget(self._detail_subtitle)
        layout.addWidget(self._detail_summary)
        layout.addWidget(self._detail_fields_tree, 1)
        layout.addWidget(self._detail_notes)
        return group

    def _build_auth_methods_panel(self) -> QGroupBox:
        group = QGroupBox("Auth Methods")
        layout = QVBoxLayout(group)
        self._auth_methods_tree.setColumnCount(3)
        self._auth_methods_tree.setHeaderLabels(["Method", "Status", "Summary"])
        self._auth_methods_tree.setRootIsDecorated(False)
        self._auth_methods_tree.setAlternatingRowColors(True)
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
        self._capabilities_tree.setRootIsDecorated(False)
        self._capabilities_tree.setAlternatingRowColors(True)
        self._capabilities_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._capabilities_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._capabilities_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        layout.addWidget(self._capabilities_tree)
        return group

    def _build_actions_panel(self) -> QGroupBox:
        group = QGroupBox("Actions")
        layout = QVBoxLayout(group)
        self._actions_container = QWidget(group)
        self._actions_layout = QGridLayout(self._actions_container)
        self._actions_layout.setContentsMargins(0, 0, 0, 0)
        self._actions_layout.setHorizontalSpacing(8)
        self._actions_layout.setVerticalSpacing(8)
        layout.addWidget(self._actions_container)
        return group

    def _build_log_panel(self) -> QGroupBox:
        group = QGroupBox("Activity Log")
        layout = QVBoxLayout(group)
        self._log_panel.setReadOnly(True)
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
        notes = []
        if details.source_paths:
            notes.append(
                "Sources: " + ", ".join(str(path) for path in details.source_paths)
            )
        notes.extend(details.notes)
        self._detail_notes.setText("\n".join(notes))

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
        while self._actions_layout.count():
            child = self._actions_layout.takeAt(0)
            widget = child.widget()
            if widget is not None:
                widget.deleteLater()

        self._action_buttons = {}
        busy = self._controller.session_state.command_state.value == "running"
        for index, action in enumerate(actions):
            button = QPushButton(action.label)
            button.setObjectName(f"action-{action.action_id}")
            button.clicked.connect(lambda _checked=False, action_id=action.action_id: self._controller.trigger_action(action_id))
            button.setEnabled(action.enabled and not busy)
            tooltip = action.description
            if not action.enabled and action.disabled_reason:
                tooltip = f"{action.description}\n{action.disabled_reason}".strip()
            button.setToolTip(tooltip)
            row, column = divmod(index, 2)
            self._actions_layout.addWidget(button, row, column)
            self._action_buttons[action.action_id] = button

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
