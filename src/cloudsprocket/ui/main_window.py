from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QFileDialog,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QSplitter,
    QSpinBox,
    QStackedWidget,
    QStatusBar,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

try:
    from qfluentwidgets import FluentIcon as FIF
except ImportError:
    FIF = None  # type: ignore[assignment]

from cloudsprocket.config import APP_DESCRIPTION, AppSettings
from cloudsprocket.models import (
    AuthMethod,
    AuthMethodStatus,
    DetailField,
    LogEntry,
    ProfileDetails,
    ProviderAction,
    ProviderHealth,
    WorkspaceTab,
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
        self._body_stack = QStackedWidget()
        self._primary_sections_tabs = QTabWidget()
        self._session_tabs = QTabWidget()
        self._workspace_tabs = QTabWidget()
        self._brand_eyebrow_label = QLabel("CONTROL DESKTOP")
        self._brand_badge_label = QLabel("CS")
        self._hero_heading_label = QLabel()
        self._hero_summary_label = QLabel()
        self._hero_steps_label = QLabel()
        self._hero_provider_metric_label = QLabel()
        self._hero_profile_metric_label = QLabel()
        self._hero_auth_metric_label = QLabel()
        self._hero_target_metric_label = QLabel()
        self._session_provider_label = QLabel()
        self._session_profile_label = QLabel()
        self._session_auth_label = QLabel()
        self._session_lock_hint_label = QLabel()
        self._session_lock_button = QPushButton("Lock Session")
        self._workspace_title = QLabel()
        self._workspace_subtitle = QLabel()
        self._workspace_meta = QLabel()
        self._workspace_unlock_button = QPushButton("Unlock")
        self._workspace_overview_heading = QLabel()
        self._workspace_overview_summary = QLabel()
        self._workspace_overview_detail = QLabel()
        self._workspace_overview_sources = QLabel()
        self._workspace_overview_notes = QLabel()
        self._workspace_actions_hint_label = QLabel()
        self._workspace_profile_actions_label = QLabel()
        self._workspace_global_actions_label = QLabel()
        self._workspace_profile_actions_container = QWidget()
        self._workspace_profile_actions_layout = QGridLayout(self._workspace_profile_actions_container)
        self._workspace_global_actions_container = QWidget()
        self._workspace_global_actions_layout = QGridLayout(self._workspace_global_actions_container)
        self._workspace_s3_status_label = QLabel()
        self._workspace_s3_bucket_status_label = QLabel()
        self._workspace_s3_selected_bucket_label = QLabel()
        self._workspace_s3_upload_status_label = QLabel()
        self._workspace_s3_upload_source_input = QLineEdit()
        self._workspace_s3_upload_browse_button = QPushButton("Choose File")
        self._workspace_s3_upload_clear_button = QPushButton("Clear")
        self._workspace_s3_upload_key_input = QLineEdit()
        self._workspace_s3_upload_button = QPushButton("Upload File")
        self._workspace_s3_upload_detail_tree = QTreeWidget()
        self._workspace_s3_prefix_input = QLineEdit()
        self._workspace_s3_apply_prefix_button = QPushButton("Apply Prefix")
        self._workspace_s3_clear_prefix_button = QPushButton("Clear Prefix")
        self._workspace_s3_refresh_buckets_button = QPushButton("Refresh Buckets")
        self._workspace_s3_refresh_bucket_button = QPushButton("Refresh Bucket Contents")
        self._workspace_s3_copy_uri_button = QPushButton("Copy S3 URI")
        self._workspace_s3_bucket_tree = QTreeWidget()
        self._workspace_s3_object_tree = QTreeWidget()
        self._workspace_s3_object_status_label = QLabel()
        self._workspace_s3_object_details_tree = QTreeWidget()
        self._workspace_s3_signed_url_status_label = QLabel()
        self._workspace_s3_signed_url_duration_spin = QSpinBox()
        self._workspace_s3_signed_url_duration_unit_combo = QComboBox()
        self._workspace_s3_generate_signed_url_button = QPushButton("Generate Signed URL")
        self._workspace_s3_copy_signed_url_button = QPushButton("Copy Signed URL")
        self._workspace_s3_signed_url_output = QPlainTextEdit()
        self._workspace_s3_use_generated_url_button = QPushButton("Use Generated URL")
        self._workspace_s3_analyse_url_button = QPushButton("Analyse URL")
        self._workspace_s3_validate_url_button = QPushButton("Validate URL")
        self._workspace_s3_url_tester_status_label = QLabel()
        self._workspace_s3_url_tester_input = QPlainTextEdit()
        self._workspace_s3_url_tester_details_tree = QTreeWidget()
        self._workspace_s3_root_splitter: QSplitter | None = None
        self._workspace_s3_content_splitter: QSplitter | None = None
        self._workspace_s3_inspector_tabs: QTabWidget | None = None
        self._detail_sections_splitter = QSplitter(Qt.Vertical)
        self._rendering_state = False

        self.setWindowTitle(settings.app_brand_name)
        self.resize(1360, 860)
        self.setStatusBar(self._status_bar)
        self._workspace_s3_apply_prefix_button.clicked.connect(self._on_s3_apply_prefix_clicked)
        self._workspace_s3_clear_prefix_button.clicked.connect(self._on_s3_clear_prefix_clicked)
        self._workspace_s3_refresh_buckets_button.clicked.connect(self._on_s3_refresh_buckets_clicked)
        self._workspace_s3_refresh_bucket_button.clicked.connect(self._on_s3_refresh_bucket_clicked)
        self._workspace_s3_copy_uri_button.clicked.connect(self._on_s3_copy_uri_clicked)
        self._workspace_s3_upload_browse_button.clicked.connect(self._on_s3_upload_browse_clicked)
        self._workspace_s3_upload_clear_button.clicked.connect(self._on_s3_upload_clear_clicked)
        self._workspace_s3_upload_source_input.textChanged.connect(self._on_s3_upload_source_text_changed)
        self._workspace_s3_upload_key_input.textChanged.connect(self._on_s3_upload_key_text_changed)
        self._workspace_s3_upload_button.clicked.connect(self._on_s3_upload_clicked)
        self._workspace_s3_signed_url_duration_spin.valueChanged.connect(self._on_s3_signed_url_duration_changed)
        self._workspace_s3_signed_url_duration_unit_combo.currentTextChanged.connect(self._on_s3_signed_url_unit_changed)
        self._workspace_s3_generate_signed_url_button.clicked.connect(self._on_s3_generate_signed_url_clicked)
        self._workspace_s3_copy_signed_url_button.clicked.connect(self._on_s3_copy_signed_url_clicked)
        self._workspace_s3_use_generated_url_button.clicked.connect(self._on_s3_use_generated_url_clicked)
        self._workspace_s3_analyse_url_button.clicked.connect(self._on_s3_analyse_url_clicked)
        self._workspace_s3_validate_url_button.clicked.connect(self._on_s3_validate_url_clicked)
        self._workspace_s3_url_tester_input.textChanged.connect(self._on_s3_url_tester_text_changed)
        self._workspace_s3_bucket_tree.itemSelectionChanged.connect(self._on_s3_bucket_selection_changed)
        self._workspace_s3_object_tree.itemSelectionChanged.connect(self._on_s3_object_selection_changed)

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
    def detail_sections_splitter(self) -> QSplitter:
        return self._detail_sections_splitter

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
    def hero_heading_label(self) -> QLabel:
        return self._hero_heading_label

    @property
    def hero_provider_metric_label(self) -> QLabel:
        return self._hero_provider_metric_label

    @property
    def hero_profile_metric_label(self) -> QLabel:
        return self._hero_profile_metric_label

    @property
    def hero_auth_metric_label(self) -> QLabel:
        return self._hero_auth_metric_label

    @property
    def hero_target_metric_label(self) -> QLabel:
        return self._hero_target_metric_label

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

    @property
    def session_tabs(self) -> QTabWidget:
        return self._session_tabs

    @property
    def workspace_tabs(self) -> QTabWidget:
        return self._workspace_tabs

    @property
    def workspace_s3_bucket_tree(self) -> QTreeWidget:
        return self._workspace_s3_bucket_tree

    @property
    def workspace_s3_object_tree(self) -> QTreeWidget:
        return self._workspace_s3_object_tree

    @property
    def workspace_s3_object_details_tree(self) -> QTreeWidget:
        return self._workspace_s3_object_details_tree

    @property
    def workspace_s3_prefix_input(self) -> QLineEdit:
        return self._workspace_s3_prefix_input

    @property
    def workspace_s3_apply_prefix_button(self) -> QPushButton:
        return self._workspace_s3_apply_prefix_button

    @property
    def workspace_s3_refresh_buckets_button(self) -> QPushButton:
        return self._workspace_s3_refresh_buckets_button

    @property
    def workspace_s3_refresh_bucket_button(self) -> QPushButton:
        return self._workspace_s3_refresh_bucket_button

    @property
    def workspace_s3_copy_uri_button(self) -> QPushButton:
        return self._workspace_s3_copy_uri_button

    @property
    def workspace_s3_bucket_status_label(self) -> QLabel:
        return self._workspace_s3_bucket_status_label

    @property
    def workspace_s3_upload_status_label(self) -> QLabel:
        return self._workspace_s3_upload_status_label

    @property
    def workspace_s3_upload_source_input(self) -> QLineEdit:
        return self._workspace_s3_upload_source_input

    @property
    def workspace_s3_upload_key_input(self) -> QLineEdit:
        return self._workspace_s3_upload_key_input

    @property
    def workspace_s3_upload_button(self) -> QPushButton:
        return self._workspace_s3_upload_button

    @property
    def workspace_s3_upload_detail_tree(self) -> QTreeWidget:
        return self._workspace_s3_upload_detail_tree

    @property
    def workspace_s3_selected_bucket_label(self) -> QLabel:
        return self._workspace_s3_selected_bucket_label

    @property
    def workspace_s3_signed_url_duration_spin(self) -> QSpinBox:
        return self._workspace_s3_signed_url_duration_spin

    @property
    def workspace_s3_generate_signed_url_button(self) -> QPushButton:
        return self._workspace_s3_generate_signed_url_button

    @property
    def workspace_s3_copy_signed_url_button(self) -> QPushButton:
        return self._workspace_s3_copy_signed_url_button

    @property
    def workspace_s3_signed_url_output(self) -> QPlainTextEdit:
        return self._workspace_s3_signed_url_output

    @property
    def workspace_s3_signed_url_duration_unit_combo(self) -> QComboBox:
        return self._workspace_s3_signed_url_duration_unit_combo

    @property
    def workspace_s3_use_generated_url_button(self) -> QPushButton:
        return self._workspace_s3_use_generated_url_button

    @property
    def workspace_s3_analyse_url_button(self) -> QPushButton:
        return self._workspace_s3_analyse_url_button

    @property
    def workspace_s3_validate_url_button(self) -> QPushButton:
        return self._workspace_s3_validate_url_button

    @property
    def workspace_s3_url_tester_input(self) -> QPlainTextEdit:
        return self._workspace_s3_url_tester_input

    @property
    def workspace_s3_url_tester_details_tree(self) -> QTreeWidget:
        return self._workspace_s3_url_tester_details_tree

    @property
    def workspace_s3_root_splitter(self) -> QSplitter | None:
        return self._workspace_s3_root_splitter

    @property
    def workspace_s3_content_splitter(self) -> QSplitter | None:
        return self._workspace_s3_content_splitter

    @property
    def workspace_s3_inspector_tabs(self) -> QTabWidget | None:
        return self._workspace_s3_inspector_tabs

    @property
    def primary_sections_tabs(self) -> QTabWidget:
        return self._primary_sections_tabs

    @property
    def lock_session_button(self) -> QPushButton:
        return self._session_lock_button

    @property
    def unlock_session_button(self) -> QPushButton:
        return self._workspace_unlock_button

    @property
    def body_stack(self) -> QStackedWidget:
        return self._body_stack

    def about_text(self) -> str:
        return self._controller.about_text()

    def render_state(self) -> None:
        self._rendering_state = True
        try:
            self._config_label.setText(f"Config root: {self._settings.config_dir}")
            self._render_provider_snapshot(self._controller.provider_snapshot)
            self._render_profile_list()
            self._render_profile_details(self._controller.selected_profile_details())
            self._render_session_setup()
            self._render_workspace()
            self._render_workspace_s3()
            self._render_actions(self._controller.available_actions())
            self._render_logs(self._controller.log_entries())
            self._body_stack.setCurrentIndex(1 if self._controller.is_session_locked() else 0)
            self._status_bar.showMessage(self._controller.status_message())
        finally:
            self._rendering_state = False

    def _build_ui(self) -> None:
        refresh_action = QAction("Refresh", self)
        refresh_action.triggered.connect(lambda: self._controller.trigger_action("refresh"))
        about_action = QAction("About", self)
        about_action.triggered.connect(self._show_about_dialog)

        self._set_action_icon(refresh_action, "SYNC")
        self._set_action_icon(about_action, "INFO")

        menu_bar = self.menuBar()
        menu_bar.addAction(refresh_action)
        menu_bar.addAction(about_action)

        central = QWidget(self)
        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(16, 14, 16, 14)
        root_layout.setSpacing(12)

        root_layout.addLayout(self._build_header())
        root_layout.addWidget(self._build_body(), 1)

        self.setCentralWidget(central)
        self._apply_theme()

    def _apply_theme(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow, QWidget {
                background-color: #f5f7fb;
                color: #0f172a;
            }
            QMenuBar, QStatusBar {
                background-color: #ffffff;
                color: #1e293b;
                border-bottom: 1px solid #d7deea;
            }
            QMenuBar::item {
                padding: 6px 10px;
                border-radius: 6px;
            }
            QMenuBar::item:selected {
                background-color: #e9f1ff;
            }
            QGroupBox {
                background-color: #ffffff;
                border: 1px solid #d2dbea;
                border-radius: 12px;
                margin-top: 15px;
                padding: 10px;
                padding-top: 17px;
                font-weight: 700;
                color: #12314d;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
                color: #12314d;
                background-color: #ffffff;
            }
            QPushButton {
                background-color: #ffffff;
                color: #1e293b;
                border: 1px solid #aebfd5;
                border-radius: 8px;
                padding: 6px 11px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #f3f7ff;
                border-color: #8fa6c2;
            }
            QPushButton:pressed {
                background-color: #e7eefb;
            }
            QPushButton:focus {
                border: 2px solid #0f6cbd;
                padding: 5px 10px;
            }
            QPushButton:disabled {
                background-color: #eef2f7;
                color: #7b8898;
                border-color: #c8d2df;
            }
            QPushButton[tone="primary"] {
                background-color: #0f6cbd;
                color: #ffffff;
                border-color: #0d5a9e;
            }
            QPushButton[tone="primary"]:hover {
                background-color: #1164af;
            }
            QPushButton[tone="primary"]:pressed {
                background-color: #0d538f;
            }
            QLineEdit, QPlainTextEdit, QTreeWidget, QComboBox, QSpinBox {
                background-color: #ffffff;
                color: #0f172a;
                border: 1px solid #bcc8d8;
                border-radius: 8px;
                selection-background-color: #0f6cbd;
                selection-color: #ffffff;
            }
            QLineEdit, QPlainTextEdit, QComboBox, QSpinBox {
                padding: 6px 8px;
            }
            QLineEdit:focus, QPlainTextEdit:focus, QComboBox:focus, QSpinBox:focus {
                border: 2px solid #0f6cbd;
                padding: 5px 7px;
            }
            QTreeWidget {
                alternate-background-color: #f9fbff;
                gridline-color: #d7e0ee;
            }
            QTreeWidget::item {
                padding: 4px 6px;
            }
            QTreeWidget::item:selected {
                background-color: #deecff;
                color: #12314d;
            }
            QHeaderView::section {
                background-color: #eff4fb;
                color: #243b53;
                padding: 7px;
                border: none;
                border-right: 1px solid #d4deea;
                border-bottom: 1px solid #c4d0de;
                font-weight: 700;
            }
            QTabWidget::pane {
                border: 1px solid #d2dbea;
                border-radius: 10px;
                background: #ffffff;
                top: -1px;
            }
            QTabBar::tab {
                background: #eaf1fa;
                color: #1f3a56;
                border: 1px solid #d2dbea;
                border-bottom: none;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
                padding: 7px 11px;
                margin-right: 4px;
                font-weight: 600;
            }
            QTabBar::tab:selected {
                background: #ffffff;
                color: #0f2d47;
            }
            QTabBar::tab:!selected:hover {
                background: #f0f5fc;
            }
            QSplitter::handle {
                background-color: #8ea4bf;
                border-radius: 5px;
                margin: 1px;
            }
            QSplitter::handle:vertical {
                height: 8px;
            }
            QSplitter::handle:horizontal {
                width: 8px;
            }
            QSplitter::handle:hover {
                background-color: #728ba7;
            }
            QScrollBar:vertical, QScrollBar:horizontal {
                background: #e4ebf5;
                border-radius: 5px;
            }
            QScrollBar::handle:vertical, QScrollBar::handle:horizontal {
                background: #607a97;
                border-radius: 5px;
                min-height: 22px;
                min-width: 22px;
            }
            QScrollBar::handle:vertical:hover, QScrollBar::handle:horizontal:hover {
                background: #4d6580;
            }
            """
        )

    def _info_card_style(self, *, emphasised: bool = False) -> str:
        background = "#e8f1fa" if emphasised else "#f6f8fb"
        border = "#6f89a5" if emphasised else "#9dafc1"
        foreground = "#10283f" if emphasised else "#243b53"
        return (
            "padding: 11px 13px; "
            f"background: {background}; "
            f"border: 1px solid {border}; "
            "border-radius: 12px; "
            f"color: {foreground};"
        )

    def _section_label_style(self) -> str:
        return "font-size: 13px; font-weight: 700; color: #184b72; padding-top: 4px;"

    def _hero_panel_style(self) -> str:
        return (
            "background: qlineargradient(x1:0, y1:0, x2:1, y2:1, "
            "stop:0 #123956, stop:1 #1e5f8c); "
            "border: 1px solid #0e314a; "
            "border-radius: 20px;"
        )

    def _hero_metric_style(self, *, emphasised: bool = False) -> str:
        background = "#eff5fa" if emphasised else "#f8fbfd"
        border = "#6f89a5" if emphasised else "#a5b6c7"
        return (
            "padding: 12px 14px; "
            f"background: {background}; "
            f"border: 1px solid {border}; "
            "border-radius: 14px;"
        )

    def _hero_pill_style(self, *, accent: bool = False) -> str:
        background = "#f5c04e" if accent else "rgba(255, 255, 255, 0.12)"
        foreground = "#10283f" if accent else "#f5fbff"
        border = "#f5c04e" if accent else "rgba(255, 255, 255, 0.2)"
        return (
            "padding: 6px 12px; "
            f"background: {background}; "
            f"color: {foreground}; "
            f"border: 1px solid {border}; "
            "border-radius: 999px; "
            "font-size: 12px; font-weight: 700;"
        )

    def _set_hero_metric_text(self, label: QLabel, *, value: str, caption: str) -> None:
        label.setText(
            f"<div style='font-size:24px; font-weight:700; color:#10283f;'>{value}</div>"
            f"<div style='font-size:12px; font-weight:600; color:#36506a; margin-top:2px;'>{caption}</div>"
        )

    def _set_button_tone(self, button: QPushButton, tone: str) -> None:
        button.setProperty("tone", tone)
        button.style().unpolish(button)
        button.style().polish(button)

    def _fluent_icon(self, icon_name: str):
        if FIF is None:
            return None
        candidate = getattr(FIF, icon_name, None)
        if candidate is None:
            return None
        try:
            return candidate.icon()
        except Exception:
            return None

    def _set_action_icon(self, action: QAction, icon_name: str) -> None:
        icon = self._fluent_icon(icon_name)
        if icon is not None:
            action.setIcon(icon)

    def _set_button_icon(self, button: QPushButton, icon_name: str) -> None:
        icon = self._fluent_icon(icon_name)
        if icon is not None:
            button.setIcon(icon)

    def _set_tab_icon(self, tabs: QTabWidget, index: int, icon_name: str) -> None:
        icon = self._fluent_icon(icon_name)
        if icon is not None:
            tabs.setTabIcon(index, icon)

    def _build_header(self) -> QHBoxLayout:
        self._brand_eyebrow_label.setStyleSheet(
            "font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #2a5d87;"
        )
        title = QLabel(self._settings.app_brand_name)
        title.setObjectName("title")
        title.setStyleSheet("font-size: 24px; font-weight: 800; color: #0f2b45;")

        subtitle = QLabel(APP_DESCRIPTION)
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("color: #41576f; font-size: 13px;")

        byline = QLabel(f"Created by {self._settings.author_name}")
        byline.setStyleSheet("color: #1d4f76; font-size: 11px; font-weight: 700;")

        self._config_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._config_label.setStyleSheet(
            "padding: 8px 10px; background: #ffffff; border: 1px solid #d2dbea; "
            "border-radius: 9px; color: #2a4159; font-size: 11px;"
        )

        refresh_button = QPushButton("Refresh Snapshot")
        self._set_button_icon(refresh_button, "SYNC")
        self._set_button_tone(refresh_button, "primary")
        refresh_button.clicked.connect(lambda: self._controller.trigger_action("refresh"))
        refresh_button.setFixedWidth(168)

        left_column = QVBoxLayout()
        left_column.setSpacing(3)
        left_column.addWidget(self._brand_eyebrow_label)
        left_column.addWidget(title)
        left_column.addWidget(subtitle)
        left_column.addWidget(byline)

        right_column = QVBoxLayout()
        right_column.setSpacing(8)
        right_column.addWidget(self._config_label)
        right_column.addWidget(refresh_button, 0, Qt.AlignRight)

        layout = QHBoxLayout()
        layout.setSpacing(12)
        layout.addLayout(left_column, 1)
        layout.addLayout(right_column, 0)
        return layout

    def _build_brand_panel(self) -> QWidget:
        panel = QWidget()
        panel.setStyleSheet(self._hero_panel_style())

        layout = QVBoxLayout(panel)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(18)

        self._brand_badge_label.setAlignment(Qt.AlignCenter)
        self._brand_badge_label.setFixedSize(88, 88)
        self._brand_badge_label.setStyleSheet(
            "background: rgba(255, 255, 255, 0.12); color: #f7fbfe; border: 1px solid rgba(255, 255, 255, 0.18); "
            "border-radius: 24px; font-size: 28px; font-weight: 800; letter-spacing: 0.08em;"
        )

        self._hero_heading_label.setStyleSheet("font-size: 28px; font-weight: 800; color: #f7fbfe;")
        self._hero_heading_label.setWordWrap(True)
        self._hero_summary_label.setStyleSheet("font-size: 14px; color: #d9ebf7;")
        self._hero_summary_label.setWordWrap(True)
        self._hero_steps_label.setStyleSheet(
            "padding: 10px 12px; background: rgba(255, 255, 255, 0.10); color: #f3f9fe; "
            "border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; font-size: 13px; font-weight: 600;"
        )
        self._hero_steps_label.setWordWrap(True)

        chip_cli = QLabel("CLI-first")
        chip_cli.setStyleSheet(self._hero_pill_style(accent=True))
        chip_sso = QLabel("SSO-aware")
        chip_sso.setStyleSheet(self._hero_pill_style())
        chip_files = QLabel("Local profile visibility")
        chip_files.setStyleSheet(self._hero_pill_style())
        chip_layout = QHBoxLayout()
        chip_layout.setSpacing(8)
        chip_layout.addWidget(chip_cli)
        chip_layout.addWidget(chip_sso)
        chip_layout.addWidget(chip_files)
        chip_layout.addStretch(1)

        text_layout = QVBoxLayout()
        text_layout.setSpacing(8)
        text_layout.addWidget(self._hero_heading_label)
        text_layout.addWidget(self._hero_summary_label)
        text_layout.addLayout(chip_layout)

        top_layout = QHBoxLayout()
        top_layout.setSpacing(16)
        top_layout.addWidget(self._brand_badge_label, 0, Qt.AlignTop)
        top_layout.addLayout(text_layout, 1)

        metric_labels = (
            self._hero_provider_metric_label,
            self._hero_profile_metric_label,
            self._hero_auth_metric_label,
            self._hero_target_metric_label,
        )
        for index, label in enumerate(metric_labels):
            label.setTextFormat(Qt.RichText)
            label.setTextInteractionFlags(Qt.NoTextInteraction)
            label.setStyleSheet(self._hero_metric_style(emphasised=index == 2))

        metrics_layout = QGridLayout()
        metrics_layout.setHorizontalSpacing(12)
        metrics_layout.setVerticalSpacing(12)
        metrics_layout.addWidget(self._hero_provider_metric_label, 0, 0)
        metrics_layout.addWidget(self._hero_profile_metric_label, 0, 1)
        metrics_layout.addWidget(self._hero_auth_metric_label, 1, 0)
        metrics_layout.addWidget(self._hero_target_metric_label, 1, 1)

        layout.addLayout(top_layout)
        layout.addWidget(self._hero_steps_label)
        layout.addLayout(metrics_layout)
        return panel

    def _build_session_setup_panel(self) -> QGroupBox:
        group = QGroupBox("Session Lock")
        layout = QVBoxLayout(group)
        self._session_provider_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_profile_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_auth_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_lock_hint_label.setWordWrap(True)
        self._session_lock_hint_label.setStyleSheet(self._info_card_style(emphasised=True))
        self._set_button_tone(self._session_lock_button, "primary")
        self._session_lock_button.clicked.connect(self._on_lock_session_clicked)

        metadata_layout = QGridLayout()
        metadata_layout.addWidget(QLabel("Provider"), 0, 0)
        metadata_layout.addWidget(self._session_provider_label, 0, 1)
        metadata_layout.addWidget(QLabel("Profile"), 1, 0)
        metadata_layout.addWidget(self._session_profile_label, 1, 1)
        metadata_layout.addWidget(QLabel("Auth"), 2, 0)
        metadata_layout.addWidget(self._session_auth_label, 2, 1)

        footer_layout = QHBoxLayout()
        footer_layout.addWidget(self._session_lock_hint_label, 1)
        footer_layout.addWidget(self._session_lock_button, 0, Qt.AlignRight)

        layout.addLayout(metadata_layout)
        layout.addLayout(footer_layout)
        return group

    def _build_workspace_header(self) -> QGroupBox:
        group = QGroupBox("Locked Session")
        layout = QHBoxLayout(group)

        self._workspace_title.setStyleSheet("font-size: 22px; font-weight: 700; color: #10283f;")
        self._workspace_subtitle.setStyleSheet("font-size: 14px; font-weight: 700; color: #184b72;")
        self._workspace_meta.setWordWrap(True)
        self._workspace_meta.setStyleSheet(self._info_card_style(emphasised=True))
        self._set_button_tone(self._workspace_unlock_button, "primary")
        self._workspace_unlock_button.clicked.connect(self._on_unlock_session_clicked)

        text_layout = QVBoxLayout()
        text_layout.addWidget(self._workspace_title)
        text_layout.addWidget(self._workspace_subtitle)
        text_layout.addWidget(self._workspace_meta)

        layout.addLayout(text_layout, 1)
        layout.addWidget(self._workspace_unlock_button, 0, Qt.AlignTop)
        return group

    def _build_body(self) -> QTabWidget:
        self._body_stack.addWidget(self._build_session_page())
        self._body_stack.addWidget(self._build_workspace_page())

        control_page = QWidget()
        control_layout = QVBoxLayout(control_page)
        control_layout.setContentsMargins(0, 0, 0, 0)
        control_layout.addWidget(self._body_stack)

        activity_page = QWidget()
        activity_layout = QVBoxLayout(activity_page)
        activity_layout.setContentsMargins(0, 0, 0, 0)
        activity_layout.addWidget(self._build_log_panel(), 1)

        self._primary_sections_tabs.setDocumentMode(True)
        self._primary_sections_tabs.setTabPosition(QTabWidget.West)
        control_index = self._primary_sections_tabs.addTab(control_page, "Control")
        activity_index = self._primary_sections_tabs.addTab(activity_page, "Activity")
        self._set_tab_icon(self._primary_sections_tabs, control_index, "HOME")
        self._set_tab_icon(self._primary_sections_tabs, activity_index, "HISTORY")
        return self._primary_sections_tabs

    def _build_session_page(self) -> QWidget:
        rail_tabs = QTabWidget()
        rail_tabs.setDocumentMode(True)
        rail_tabs.setTabPosition(QTabWidget.West)
        provider_index = rail_tabs.addTab(self._build_provider_panel(), "Providers")
        profile_index = rail_tabs.addTab(self._build_profile_panel(), "Profiles")
        self._set_tab_icon(rail_tabs, provider_index, "IOT")
        self._set_tab_icon(rail_tabs, profile_index, "PEOPLE")

        self._session_tabs.setDocumentMode(True)
        self._session_tabs.addTab(self._build_overview_tab(), "Profile")
        self._session_tabs.addTab(self._build_access_tab(), "Access")
        self._session_tabs.addTab(self._build_actions_tab(), "Actions")

        session_content = QWidget()
        session_content_layout = QVBoxLayout(session_content)
        session_content_layout.setContentsMargins(0, 0, 0, 0)
        session_content_layout.setSpacing(12)
        session_content_layout.addWidget(self._build_session_setup_panel())
        session_content_layout.addWidget(self._session_tabs, 1)

        session_splitter = QSplitter(Qt.Horizontal)
        session_splitter.setChildrenCollapsible(False)
        session_splitter.addWidget(rail_tabs)
        session_splitter.addWidget(session_content)
        session_splitter.setStretchFactor(0, 2)
        session_splitter.setStretchFactor(1, 5)
        session_splitter.setSizes([390, 980])
        return session_splitter

    def _build_workspace_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)
        layout.addWidget(self._build_workspace_header())
        self._workspace_tabs.setDocumentMode(True)
        self._workspace_tabs.setTabPosition(QTabWidget.West)
        layout.addWidget(self._workspace_tabs, 1)
        return page

    def _build_workspace_overview_tab(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        self._workspace_overview_heading.setStyleSheet(
            "font-size: 16px; font-weight: 700; color: #17324d;"
        )
        self._workspace_overview_summary.setWordWrap(True)
        self._workspace_overview_summary.setStyleSheet("font-size: 14px; color: #17324d;")
        self._workspace_overview_detail.setWordWrap(True)
        self._workspace_overview_detail.setStyleSheet(self._info_card_style())
        self._workspace_overview_sources.setWordWrap(True)
        self._workspace_overview_sources.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._workspace_overview_sources.setStyleSheet(self._info_card_style(emphasised=True))
        self._workspace_overview_notes.setWordWrap(True)
        self._workspace_overview_notes.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._workspace_overview_notes.setStyleSheet(self._info_card_style())

        sources_group = QGroupBox("Source Paths")
        sources_layout = QVBoxLayout(sources_group)
        sources_layout.addWidget(self._workspace_overview_sources)

        notes_group = QGroupBox("Workspace Notes")
        notes_layout = QVBoxLayout(notes_group)
        notes_layout.addWidget(self._workspace_overview_notes)

        layout.addWidget(self._workspace_overview_heading)
        layout.addWidget(self._workspace_overview_summary)
        layout.addWidget(self._workspace_overview_detail)
        layout.addWidget(sources_group)
        layout.addWidget(notes_group)
        layout.addStretch(1)
        return page

    def _build_workspace_actions_tab(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        self._workspace_actions_hint_label.setWordWrap(True)
        self._workspace_actions_hint_label.setStyleSheet(self._info_card_style())
        self._workspace_profile_actions_label.setStyleSheet(self._section_label_style())
        self._workspace_global_actions_label.setStyleSheet(self._section_label_style())

        self._workspace_profile_actions_layout.setContentsMargins(0, 0, 0, 0)
        self._workspace_profile_actions_layout.setHorizontalSpacing(8)
        self._workspace_profile_actions_layout.setVerticalSpacing(8)
        self._workspace_global_actions_layout.setContentsMargins(0, 0, 0, 0)
        self._workspace_global_actions_layout.setHorizontalSpacing(8)
        self._workspace_global_actions_layout.setVerticalSpacing(8)

        layout.addWidget(self._workspace_actions_hint_label)
        layout.addWidget(self._workspace_profile_actions_label)
        layout.addWidget(self._workspace_profile_actions_container)
        layout.addWidget(self._workspace_global_actions_label)
        layout.addWidget(self._workspace_global_actions_container)
        layout.addStretch(1)
        return page

    def _build_workspace_s3_tab(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(14)

        self._workspace_s3_status_label.setWordWrap(True)
        self._workspace_s3_status_label.setStyleSheet(self._info_card_style(emphasised=True))
        self._workspace_s3_bucket_status_label.setWordWrap(True)
        self._workspace_s3_bucket_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_selected_bucket_label.setWordWrap(True)
        self._workspace_s3_selected_bucket_label.setStyleSheet(
            "padding: 10px 12px; background: #f7fafc; border: 1px solid #8ea3b7; "
            "border-radius: 10px; font-size: 13px; font-weight: 700; color: #17324d;"
        )
        self._workspace_s3_upload_status_label.setWordWrap(True)
        self._workspace_s3_upload_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_upload_source_input.setPlaceholderText("Choose or paste the local file path.")
        self._workspace_s3_upload_key_input.setPlaceholderText("Object key inside the selected bucket.")
        self._set_button_tone(self._workspace_s3_upload_button, "primary")
        self._set_button_tone(self._workspace_s3_refresh_buckets_button, "primary")
        self._set_button_tone(self._workspace_s3_generate_signed_url_button, "primary")
        self._set_button_tone(self._workspace_s3_validate_url_button, "primary")
        self._workspace_s3_prefix_input.setPlaceholderText("Optional prefix filter, for example logs/2026/")
        self._workspace_s3_object_status_label.setWordWrap(True)
        self._workspace_s3_object_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_signed_url_status_label.setWordWrap(True)
        self._workspace_s3_signed_url_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_signed_url_duration_spin.setRange(1, 168)
        self._workspace_s3_signed_url_duration_spin.setSingleStep(1)
        if self._workspace_s3_signed_url_duration_unit_combo.count() == 0:
            self._workspace_s3_signed_url_duration_unit_combo.addItems(["Hours", "Days"])
        self._workspace_s3_signed_url_output.setReadOnly(True)
        self._workspace_s3_signed_url_output.setPlaceholderText("Generated signed URL will appear here.")
        self._workspace_s3_signed_url_output.setLineWrapMode(QPlainTextEdit.NoWrap)
        self._workspace_s3_signed_url_output.setMinimumHeight(132)
        self._workspace_s3_url_tester_status_label.setWordWrap(True)
        self._workspace_s3_url_tester_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_url_tester_input.setPlaceholderText("Paste any URL here, including a signed URL received from someone else.")
        self._workspace_s3_url_tester_input.setMinimumHeight(90)
        self._workspace_s3_url_tester_details_tree.setColumnCount(2)
        self._workspace_s3_url_tester_details_tree.setHeaderLabels(["Field", "Value"])
        self._configure_data_tree(self._workspace_s3_url_tester_details_tree)
        self._workspace_s3_url_tester_details_tree.setUniformRowHeights(False)
        self._workspace_s3_url_tester_details_tree.setWordWrap(True)
        self._workspace_s3_url_tester_details_tree.header().setStretchLastSection(False)
        self._workspace_s3_url_tester_details_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_url_tester_details_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._workspace_s3_url_tester_details_tree.setColumnWidth(0, 220)
        self._workspace_s3_upload_detail_tree.setColumnCount(2)
        self._workspace_s3_upload_detail_tree.setHeaderLabels(["Field", "Value"])
        self._configure_data_tree(self._workspace_s3_upload_detail_tree)
        self._workspace_s3_upload_detail_tree.setUniformRowHeights(False)
        self._workspace_s3_upload_detail_tree.setWordWrap(True)
        self._workspace_s3_upload_detail_tree.header().setStretchLastSection(False)
        self._workspace_s3_upload_detail_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_upload_detail_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._workspace_s3_upload_detail_tree.setColumnWidth(0, 220)

        self._workspace_s3_bucket_tree.setColumnCount(2)
        self._workspace_s3_bucket_tree.setHeaderLabels(["Bucket", "Created"])
        self._configure_data_tree(self._workspace_s3_bucket_tree)
        self._workspace_s3_bucket_tree.header().setSectionResizeMode(0, QHeaderView.Stretch)
        self._workspace_s3_bucket_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._workspace_s3_bucket_tree.setColumnWidth(0, 240)

        self._workspace_s3_object_tree.setColumnCount(4)
        self._workspace_s3_object_tree.setHeaderLabels(["Key", "Size", "Modified", "Storage Class"])
        self._configure_data_tree(self._workspace_s3_object_tree)
        self._workspace_s3_object_tree.header().setSectionResizeMode(0, QHeaderView.Stretch)
        self._workspace_s3_object_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.header().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.header().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.setColumnWidth(0, 520)

        self._workspace_s3_object_details_tree.setColumnCount(2)
        self._workspace_s3_object_details_tree.setHeaderLabels(["Field", "Value"])
        self._configure_data_tree(self._workspace_s3_object_details_tree)
        self._workspace_s3_object_details_tree.setUniformRowHeights(False)
        self._workspace_s3_object_details_tree.setWordWrap(True)
        self._workspace_s3_object_details_tree.header().setStretchLastSection(False)
        self._workspace_s3_object_details_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_object_details_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._workspace_s3_object_details_tree.setColumnWidth(0, 220)

        bucket_group = QGroupBox("Buckets")
        bucket_layout = QVBoxLayout(bucket_group)
        bucket_layout.setSpacing(12)
        bucket_toolbar = QHBoxLayout()
        bucket_toolbar.addWidget(self._workspace_s3_refresh_buckets_button)
        bucket_toolbar.addStretch(1)
        bucket_layout.addLayout(bucket_toolbar)
        bucket_layout.addWidget(self._workspace_s3_bucket_status_label)
        bucket_layout.addWidget(self._workspace_s3_bucket_tree, 1)

        browser_panel = QWidget()
        browser_panel_layout = QVBoxLayout(browser_panel)
        browser_panel_layout.setContentsMargins(0, 0, 0, 0)
        browser_panel_layout.setSpacing(10)
        browser_panel_layout.addWidget(self._workspace_s3_selected_bucket_label)

        controls_layout = QHBoxLayout()
        controls_layout.addWidget(QLabel("Prefix"))
        controls_layout.addWidget(self._workspace_s3_prefix_input, 1)
        controls_layout.addWidget(self._workspace_s3_apply_prefix_button)
        controls_layout.addWidget(self._workspace_s3_clear_prefix_button)
        controls_layout.addWidget(self._workspace_s3_refresh_bucket_button)
        controls_layout.addWidget(self._workspace_s3_copy_uri_button)
        browser_panel_layout.addLayout(controls_layout)
        browser_panel_layout.addWidget(self._workspace_s3_object_status_label)

        object_group = QGroupBox("Objects")
        object_layout = QVBoxLayout(object_group)
        object_layout.setSpacing(12)
        object_layout.addWidget(self._workspace_s3_object_tree, 1)

        object_details_page = QWidget()
        object_details_layout = QVBoxLayout(object_details_page)
        object_details_layout.setContentsMargins(0, 0, 0, 0)
        object_details_layout.addWidget(self._workspace_s3_object_details_tree, 1)

        upload_page = QWidget()
        upload_layout = QVBoxLayout(upload_page)
        upload_layout.setContentsMargins(0, 0, 0, 0)
        upload_layout.setSpacing(12)
        upload_source_layout = QHBoxLayout()
        upload_source_layout.addWidget(QLabel("Source"))
        upload_source_layout.addWidget(self._workspace_s3_upload_source_input, 1)
        upload_source_layout.addWidget(self._workspace_s3_upload_browse_button)
        upload_source_layout.addWidget(self._workspace_s3_upload_clear_button)
        upload_key_layout = QHBoxLayout()
        upload_key_layout.addWidget(QLabel("Object Key"))
        upload_key_layout.addWidget(self._workspace_s3_upload_key_input, 1)
        upload_key_layout.addWidget(self._workspace_s3_upload_button)
        upload_layout.addWidget(self._workspace_s3_upload_status_label)
        upload_layout.addLayout(upload_source_layout)
        upload_layout.addLayout(upload_key_layout)
        upload_layout.addWidget(self._workspace_s3_upload_detail_tree, 1)

        signed_url_page = QWidget()
        signed_url_layout = QVBoxLayout(signed_url_page)
        signed_url_layout.setContentsMargins(0, 0, 0, 0)
        signed_url_layout.setSpacing(12)
        signed_url_controls = QHBoxLayout()
        signed_url_controls.addWidget(QLabel("Duration"))
        signed_url_controls.addWidget(self._workspace_s3_signed_url_duration_spin)
        signed_url_controls.addWidget(self._workspace_s3_signed_url_duration_unit_combo)
        signed_url_controls.addWidget(self._workspace_s3_generate_signed_url_button)
        signed_url_controls.addWidget(self._workspace_s3_copy_signed_url_button)
        signed_url_controls.addStretch(1)
        signed_url_layout.addWidget(self._workspace_s3_signed_url_status_label)
        signed_url_layout.addLayout(signed_url_controls)
        signed_url_layout.addWidget(self._workspace_s3_signed_url_output, 1)

        url_tester_page = QWidget()
        url_tester_layout = QVBoxLayout(url_tester_page)
        url_tester_layout.setContentsMargins(0, 0, 0, 0)
        url_tester_layout.setSpacing(12)
        url_tester_controls = QHBoxLayout()
        url_tester_controls.addWidget(self._workspace_s3_use_generated_url_button)
        url_tester_controls.addWidget(self._workspace_s3_analyse_url_button)
        url_tester_controls.addWidget(self._workspace_s3_validate_url_button)
        url_tester_controls.addStretch(1)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_status_label)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_input)
        url_tester_layout.addLayout(url_tester_controls)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_details_tree, 1)

        tools_tabs = QTabWidget()
        tools_tabs.setDocumentMode(True)
        tools_tabs.setTabPosition(QTabWidget.West)
        tools_tabs.addTab(upload_page, "Upload")
        tools_tabs.addTab(object_details_page, "Object Details")
        tools_tabs.addTab(signed_url_page, "Signed URL")
        tools_tabs.addTab(url_tester_page, "URL Tester")

        inspector_group = QGroupBox("Inspector")
        inspector_layout = QVBoxLayout(inspector_group)
        inspector_layout.addWidget(tools_tabs, 1)

        content_splitter = QSplitter(Qt.Horizontal)
        content_splitter.setChildrenCollapsible(False)
        content_splitter.addWidget(object_group)
        content_splitter.addWidget(inspector_group)
        content_splitter.setStretchFactor(0, 5)
        content_splitter.setStretchFactor(1, 3)
        content_splitter.setSizes([900, 360])

        main_panel = QWidget()
        main_panel_layout = QVBoxLayout(main_panel)
        main_panel_layout.setContentsMargins(0, 0, 0, 0)
        main_panel_layout.setSpacing(12)
        main_panel_layout.addWidget(browser_panel)
        main_panel_layout.addWidget(content_splitter, 1)

        root_splitter = QSplitter(Qt.Horizontal)
        root_splitter.setChildrenCollapsible(False)
        root_splitter.addWidget(bucket_group)
        root_splitter.addWidget(main_panel)
        root_splitter.setStretchFactor(0, 0)
        root_splitter.setStretchFactor(1, 1)
        root_splitter.setSizes([340, 1040])

        self._workspace_s3_root_splitter = root_splitter
        self._workspace_s3_content_splitter = content_splitter
        self._workspace_s3_inspector_tabs = tools_tabs

        layout.addWidget(self._workspace_s3_status_label)
        layout.addWidget(root_splitter, 1)
        return page

    def _build_provider_panel(self) -> QGroupBox:
        group = QGroupBox("Providers")
        layout = QVBoxLayout(group)
        hint = QLabel("Choose a provider to load its profiles and available auth options.")
        hint.setWordWrap(True)
        hint.setStyleSheet(self._info_card_style())
        self._provider_tree.setColumnCount(3)
        self._provider_tree.setHeaderLabels(["Provider", "State", "Summary"])
        self._configure_data_tree(self._provider_tree)
        self._provider_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._provider_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._provider_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        self._provider_tree.itemSelectionChanged.connect(self._on_provider_selection_changed)
        layout.addWidget(hint)
        layout.addWidget(self._provider_tree)
        return group

    def _build_profile_panel(self) -> QGroupBox:
        group = QGroupBox("Profiles")
        layout = QVBoxLayout(group)
        hint = QLabel("Pick a profile to inspect details, auth, and available actions.")
        hint.setWordWrap(True)
        hint.setStyleSheet(self._info_card_style())
        self._profile_tree.setColumnCount(4)
        self._profile_tree.setHeaderLabels(["Provider", "Profile", "Source", "Details"])
        self._configure_data_tree(self._profile_tree)
        self._profile_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self._profile_tree.header().setSectionResizeMode(3, QHeaderView.Stretch)
        self._profile_tree.itemSelectionChanged.connect(self._on_profile_selection_changed)
        layout.addWidget(hint)
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
        self._detail_title.setStyleSheet("font-size: 22px; font-weight: 700; color: #10283f;")
        self._detail_subtitle.setStyleSheet("color: #184b72; font-size: 13px; font-weight: 600;")
        self._detail_summary.setWordWrap(True)
        self._detail_sources.setWordWrap(True)
        self._detail_sources.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._detail_sources.setStyleSheet(self._info_card_style(emphasised=True))
        self._detail_notes.setWordWrap(True)
        self._detail_notes.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._detail_notes.setStyleSheet(self._info_card_style())
        self._reveal_sensitive_button.setCheckable(True)
        self._reveal_sensitive_button.setEnabled(False)
        self._reveal_sensitive_button.toggled.connect(self._on_sensitive_visibility_toggled)
        self._detail_fields_tree.setColumnCount(2)
        self._detail_fields_tree.setHeaderLabels(["Setting", "Value"])
        self._configure_data_tree(self._detail_fields_tree)
        self._detail_fields_tree.setUniformRowHeights(False)
        self._detail_fields_tree.setWordWrap(True)
        self._detail_fields_tree.header().setStretchLastSection(False)
        self._detail_fields_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._detail_fields_tree.header().setSectionResizeMode(1, QHeaderView.Interactive)
        self._detail_fields_tree.setMinimumHeight(320)
        self._detail_fields_tree.setColumnWidth(0, 240)
        self._detail_fields_tree.setColumnWidth(1, 580)

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
        self._detail_sections_splitter.setObjectName("detail-sections-splitter")
        self._detail_sections_splitter.setChildrenCollapsible(False)
        self._detail_sections_splitter.addWidget(sources_group)
        self._detail_sections_splitter.addWidget(fields_group)
        self._detail_sections_splitter.addWidget(notes_group)
        self._detail_sections_splitter.setStretchFactor(0, 1)
        self._detail_sections_splitter.setStretchFactor(1, 4)
        self._detail_sections_splitter.setStretchFactor(2, 2)
        self._detail_sections_splitter.setSizes([120, 360, 180])
        layout.addWidget(self._detail_sections_splitter, 1)
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
        self._auth_methods_tree.itemSelectionChanged.connect(self._on_auth_method_selection_changed)
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
        self._actions_hint_label.setStyleSheet(self._info_card_style())
        self._profile_actions_label.setStyleSheet(self._section_label_style())
        self._global_actions_label.setStyleSheet(self._section_label_style())

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
        group = QGroupBox("Activity")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)
        caption = QLabel("Command output and action history are grouped here so the control view stays focused.")
        caption.setWordWrap(True)
        caption.setStyleSheet(self._info_card_style())
        layout.addWidget(caption)
        self._log_panel.setReadOnly(True)
        self._log_panel.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self._log_panel.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self._log_panel.setCenterOnScroll(False)
        self._log_panel.setLineWrapMode(QPlainTextEdit.WidgetWidth)
        self._log_panel.setPlaceholderText("Command output and action history will appear here.")
        layout.addWidget(self._log_panel, 1)
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
        selected_auth_method = self._controller.selected_auth_method()
        self._auth_methods_tree.blockSignals(True)
        selected_auth_item: QTreeWidgetItem | None = None
        for method in details.auth_methods:
            item = self._auth_method_item(method)
            item.setData(0, Qt.UserRole, method.method.value)
            self._auth_methods_tree.addTopLevelItem(item)
            if method.available and method.method == selected_auth_method:
                selected_auth_item = item
        if selected_auth_item is not None:
            self._auth_methods_tree.setCurrentItem(selected_auth_item)
        self._auth_methods_tree.blockSignals(False)
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

    def _render_session_setup(self) -> None:
        current_provider = self._controller.current_provider_id()
        selected_profile = self._controller.selected_profile()
        selected_auth_method = self._controller.selected_auth_method()
        provider_count = len(self._controller.provider_snapshot)
        profile_count = len(self._controller.discovery_report.profiles)

        self._session_provider_label.setText(current_provider.upper() if current_provider else "Not selected")
        self._session_profile_label.setText(
            selected_profile.display_name if selected_profile is not None else "Not selected"
        )
        self._session_auth_label.setText(
            selected_auth_method.value.upper() if selected_auth_method is not None else "Not selected"
        )

        lock_reason = self._controller.lock_session_reason()
        if lock_reason:
            self._session_lock_hint_label.setText(lock_reason)
        else:
            self._session_lock_hint_label.setText(
                "Lock the session to switch into the focused workspace. Use Unlock later to change provider, profile, or auth method."
            )
        self._session_lock_button.setEnabled(self._controller.can_lock_session())

        target_value = "Awaiting target"
        if current_provider and selected_profile is not None:
            target_value = f"{current_provider.upper()} / {selected_profile.display_name}"
        elif current_provider:
            target_value = current_provider.upper()

        auth_value = selected_auth_method.value.upper() if selected_auth_method is not None else "Choose"
        self._hero_heading_label.setText("Lock the right cloud workspace before you act.")
        self._hero_summary_label.setText(
            "Use CloudSprocket to align provider, profile, and auth state first, then move into the focused workspace for service work."
        )
        self._hero_steps_label.setText(
            "1 Choose a provider.  2 Inspect the profile context.  3 Pick an auth path.  4 Lock the session and continue inside the workspace."
        )
        self._set_hero_metric_text(
            self._hero_provider_metric_label,
            value=str(provider_count),
            caption="Providers visible",
        )
        self._set_hero_metric_text(
            self._hero_profile_metric_label,
            value=str(profile_count),
            caption="Profiles discovered",
        )
        self._set_hero_metric_text(
            self._hero_auth_metric_label,
            value=auth_value,
            caption="Selected auth",
        )
        self._set_hero_metric_text(
            self._hero_target_metric_label,
            value=target_value,
            caption="Current target",
        )

    def _render_workspace(self) -> None:
        self._workspace_title.setText(self._controller.locked_session_title())
        self._workspace_subtitle.setText(self._controller.locked_session_summary())
        locked_profile = self._controller.locked_profile()
        locked_auth_method = self._controller.session_state.locked_auth_method
        provider_health = self._controller.locked_provider_health()
        selected_details = self._controller.selected_profile_details()
        details = []
        if locked_profile is not None:
            details.append(f"Profile: {locked_profile.display_name}")
        if locked_auth_method is not None:
            details.append(f"Auth: {locked_auth_method.value.upper()}")
        if provider_health and provider_health.command_path:
            details.append(f"CLI: {provider_health.command_path}")
        self._workspace_meta.setText(
            "\n".join(details) if details else "Unlock the session to change provider or configuration."
        )

        if self._controller.is_session_locked():
            self._workspace_overview_heading.setText("Focused Session Overview")
            self._workspace_overview_summary.setText(selected_details.summary)
            self._workspace_overview_detail.setText(
                "The workspace is locked to the current provider, profile, and auth method. "
                "Use the service tabs for task-specific work or unlock the session to change configuration."
            )
            self._workspace_overview_sources.setText(
                "\n".join(str(path) for path in selected_details.source_paths)
                if selected_details.source_paths
                else "No source paths were reported for this profile."
            )
            self._workspace_overview_notes.setText(
                "\n".join(selected_details.notes)
                if selected_details.notes
                else "No additional notes for this locked session."
            )
        else:
            self._workspace_overview_heading.setText("Focused Session Overview")
            self._workspace_overview_summary.setText(
                "Lock a session to switch from setup into the focused workspace."
            )
            self._workspace_overview_detail.setText(
                "Choose a provider, profile, and available auth method in the Session page, then lock the session."
            )
            self._workspace_overview_sources.setText("No locked session is active.")
            self._workspace_overview_notes.setText("No additional notes for this locked session.")

        current_tab_id = None
        current_widget = self._workspace_tabs.currentWidget()
        if current_widget is not None:
            current_tab_id = current_widget.property("workspace_tab_id")

        self._workspace_s3_root_splitter = None
        self._workspace_s3_content_splitter = None
        self._workspace_s3_inspector_tabs = None
        self._workspace_tabs.clear()
        next_index = 0
        for index, tab in enumerate(self._controller.workspace_tabs()):
            if tab.tab_id == "overview":
                page = self._build_workspace_overview_tab()
            elif tab.tab_id == "s3":
                page = self._build_workspace_s3_tab()
            elif tab.tab_id == "actions":
                page = self._build_workspace_actions_tab()
            else:
                page = self._build_workspace_tab(tab)
            page.setProperty("workspace_tab_id", tab.tab_id)
            tab_index = self._workspace_tabs.addTab(page, tab.label)
            icon_name = self._workspace_tab_icon_name(tab.tab_id)
            if icon_name is not None:
                self._set_tab_icon(self._workspace_tabs, tab_index, icon_name)
            if tab.tab_id == current_tab_id:
                next_index = index
        if self._workspace_tabs.count():
            self._workspace_tabs.setCurrentIndex(next_index)

    def _render_workspace_s3(self) -> None:
        state = self._controller.aws_s3_workspace()
        available, reason = self._controller.aws_s3_availability()
        self._workspace_s3_status_label.setText(state.status_message or reason)
        self._workspace_s3_bucket_status_label.setText(state.bucket_status_message)
        self._workspace_s3_upload_status_label.setText(state.upload_status_message)
        if state.selected_bucket_name:
            object_count = len(state.objects)
            object_label = "object" if object_count == 1 else "objects"
            summary_parts = [
                f"Selected bucket: {state.selected_bucket_name}",
                f"{object_count} {object_label} visible",
            ]
            if state.selected_object_key:
                summary_parts.append(f"Selected object: {state.selected_object_key}")
            if state.prefix_filter:
                summary_parts.append(f"Prefix: {state.prefix_filter}")
            self._workspace_s3_selected_bucket_label.setText(
                " | ".join(summary_parts)
            )
        else:
            self._workspace_s3_selected_bucket_label.setText(
                "Select a bucket to browse its objects, inspect metadata, and generate a signed URL."
            )
        if self._workspace_s3_prefix_input.text() != state.prefix_filter:
            self._workspace_s3_prefix_input.setText(state.prefix_filter)
        if self._workspace_s3_upload_source_input.text() != state.upload_source_path:
            self._workspace_s3_upload_source_input.setText(state.upload_source_path)
        if self._workspace_s3_upload_key_input.text() != state.upload_object_key:
            self._workspace_s3_upload_key_input.setText(state.upload_object_key)
        bucket_selected = state.selected_bucket_name is not None
        self._workspace_s3_refresh_buckets_button.setEnabled(self._controller.can_refresh_aws_s3_buckets())
        self._workspace_s3_refresh_bucket_button.setEnabled(self._controller.can_refresh_aws_s3_objects())
        self._workspace_s3_refresh_bucket_button.setVisible(available or state.selected_bucket_name is not None)
        self._workspace_s3_prefix_input.setEnabled(available)
        self._workspace_s3_apply_prefix_button.setEnabled(available and bucket_selected)
        self._workspace_s3_clear_prefix_button.setEnabled(available and bucket_selected and bool(state.prefix_filter))
        self._workspace_s3_copy_uri_button.setEnabled(state.selected_bucket_name is not None)
        self._workspace_s3_upload_source_input.setEnabled(available)
        self._workspace_s3_upload_key_input.setEnabled(available)
        self._workspace_s3_upload_browse_button.setEnabled(available)
        self._workspace_s3_upload_clear_button.setEnabled(available and bool(state.upload_source_path or state.upload_object_key))
        self._workspace_s3_upload_button.setEnabled(self._controller.can_upload_aws_s3_file())
        duration_max = 7 if state.signed_url_duration_unit.value == "days" else 168
        self._workspace_s3_signed_url_duration_spin.blockSignals(True)
        self._workspace_s3_signed_url_duration_spin.setRange(1, duration_max)
        if self._workspace_s3_signed_url_duration_spin.value() != state.signed_url_duration_value:
            self._workspace_s3_signed_url_duration_spin.setValue(state.signed_url_duration_value)
        self._workspace_s3_signed_url_duration_spin.blockSignals(False)
        self._workspace_s3_signed_url_duration_unit_combo.blockSignals(True)
        combo_index = self._workspace_s3_signed_url_duration_unit_combo.findText(state.signed_url_duration_unit.value.title())
        if combo_index >= 0 and combo_index != self._workspace_s3_signed_url_duration_unit_combo.currentIndex():
            self._workspace_s3_signed_url_duration_unit_combo.setCurrentIndex(combo_index)
        self._workspace_s3_signed_url_duration_unit_combo.blockSignals(False)
        self._workspace_s3_generate_signed_url_button.setEnabled(self._controller.can_generate_aws_s3_signed_url())
        self._workspace_s3_copy_signed_url_button.setEnabled(self._controller.can_copy_aws_s3_signed_url())

        self._workspace_s3_bucket_tree.blockSignals(True)
        self._workspace_s3_bucket_tree.clear()
        selected_bucket_item: QTreeWidgetItem | None = None
        for bucket in state.buckets:
            item = QTreeWidgetItem([bucket.name, bucket.created_at])
            item.setData(0, Qt.UserRole, bucket.name)
            item.setToolTip(0, bucket.summary)
            item.setToolTip(1, bucket.created_at)
            self._workspace_s3_bucket_tree.addTopLevelItem(item)
            if bucket.name == state.selected_bucket_name:
                selected_bucket_item = item
        if selected_bucket_item is not None:
            self._workspace_s3_bucket_tree.setCurrentItem(selected_bucket_item)
        self._workspace_s3_bucket_tree.blockSignals(False)
        self._workspace_s3_bucket_tree.resizeColumnToContents(0)
        self._workspace_s3_bucket_tree.resizeColumnToContents(1)

        self._workspace_s3_upload_detail_tree.clear()
        for field in self._controller.aws_s3_upload_detail_fields():
            item = QTreeWidgetItem([field.label, field.value])
            item.setToolTip(0, field.label)
            item.setToolTip(1, field.value)
            self._workspace_s3_upload_detail_tree.addTopLevelItem(item)
        self._workspace_s3_upload_detail_tree.resizeColumnToContents(0)

        self._workspace_s3_object_tree.blockSignals(True)
        self._workspace_s3_object_tree.clear()
        selected_object_item: QTreeWidgetItem | None = None
        for obj in state.objects:
            item = QTreeWidgetItem([obj.key, obj.size, obj.modified_at, obj.storage_class])
            item.setData(0, Qt.UserRole, obj.key)
            self._workspace_s3_object_tree.addTopLevelItem(item)
            if obj.key == state.selected_object_key:
                selected_object_item = item
        if selected_object_item is not None:
            self._workspace_s3_object_tree.setCurrentItem(selected_object_item)
        self._workspace_s3_object_tree.blockSignals(False)
        self._workspace_s3_object_tree.resizeColumnToContents(1)
        self._workspace_s3_object_tree.resizeColumnToContents(2)
        self._workspace_s3_object_tree.resizeColumnToContents(3)

        self._workspace_s3_object_status_label.setText(state.object_status_message)
        self._workspace_s3_object_details_tree.clear()
        for field in state.object_metadata:
            item = QTreeWidgetItem([field.label, field.value])
            item.setToolTip(0, field.label)
            item.setToolTip(1, field.value)
            self._workspace_s3_object_details_tree.addTopLevelItem(item)
        self._workspace_s3_object_details_tree.resizeColumnToContents(0)
        self._workspace_s3_signed_url_status_label.setText(state.signed_url_status_message)
        self._workspace_s3_signed_url_output.setPlainText(state.signed_url)
        if self._workspace_s3_url_tester_input.toPlainText() != state.url_tester_input:
            self._workspace_s3_url_tester_input.setPlainText(state.url_tester_input)
        self._workspace_s3_url_tester_status_label.setText(state.url_tester_status_message)
        self._workspace_s3_url_tester_details_tree.clear()
        for field in state.url_tester_detail_fields:
            item = QTreeWidgetItem([field.label, field.value])
            item.setToolTip(0, field.label)
            item.setToolTip(1, field.value)
            self._workspace_s3_url_tester_details_tree.addTopLevelItem(item)
        self._workspace_s3_url_tester_details_tree.resizeColumnToContents(0)
        self._refresh_s3_url_tester_button_state()

    def _build_workspace_tab(self, tab: WorkspaceTab) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        summary_label = QLabel(tab.summary)
        summary_label.setStyleSheet("font-size: 16px; font-weight: 700; color: #17324d;")
        detail_label = QLabel(tab.detail or "This workspace area is not configured yet.")
        detail_label.setWordWrap(True)
        detail_label.setStyleSheet(self._info_card_style())
        layout.addWidget(summary_label)
        layout.addWidget(detail_label)
        layout.addStretch(1)
        return page

    def _render_actions(self, actions: tuple[ProviderAction, ...]) -> None:
        busy = self._controller.session_state.command_state.value == "running"
        selected_profile = self._controller.selected_profile()
        selected_profile_actions = tuple(action for action in actions if action.requires_profile)
        global_actions = tuple(action for action in actions if not action.requires_profile)
        active_prefix = "workspace" if self._controller.is_session_locked() else "session"
        self._action_buttons = self._render_action_sections(
            prefix=active_prefix,
            selected_profile=selected_profile.display_name if selected_profile is not None else None,
            selected_profile_actions=selected_profile_actions,
            global_actions=global_actions,
            busy=busy,
        )

    def _render_action_sections(
        self,
        *,
        prefix: str,
        selected_profile: str | None,
        selected_profile_actions: tuple[ProviderAction, ...],
        global_actions: tuple[ProviderAction, ...],
        busy: bool,
    ) -> dict[str, QPushButton]:
        if prefix == "workspace":
            hint_label = self._workspace_actions_hint_label
            profile_label = self._workspace_profile_actions_label
            profile_container = self._workspace_profile_actions_container
            profile_layout = self._workspace_profile_actions_layout
            global_label = self._workspace_global_actions_label
            global_container = self._workspace_global_actions_container
            global_layout = self._workspace_global_actions_layout
        else:
            hint_label = self._actions_hint_label
            profile_label = self._profile_actions_label
            profile_container = self._profile_actions_container
            profile_layout = self._profile_actions_layout
            global_label = self._global_actions_label
            global_container = self._global_actions_container
            global_layout = self._global_actions_layout

        action_buttons: dict[str, QPushButton] = {}
        self._clear_action_layout(profile_layout)
        self._clear_action_layout(global_layout)

        hint_label.setText(
            "Selected profile actions only affect the chosen profile. "
            "Provider-wide actions affect shared CLI session state or configuration."
        )
        if selected_profile is not None:
            profile_label.setText(f"Selected Profile Actions: {selected_profile}")
        else:
            profile_label.setText("Selected Profile Actions")
        global_label.setText("Provider-wide Actions")
        profile_label.setVisible(bool(selected_profile_actions))
        profile_container.setVisible(bool(selected_profile_actions))
        global_label.setVisible(bool(global_actions))
        global_container.setVisible(bool(global_actions))

        for layout, grouped_actions in (
            (profile_layout, selected_profile_actions),
            (global_layout, global_actions),
        ):
            for index, action in enumerate(grouped_actions):
                button = self._render_action_button(action, busy=busy)
                row, column = divmod(index, 2)
                layout.addWidget(button, row, column)
                action_buttons[action.action_id] = button
        return action_buttons

    def _clear_action_layout(self, layout: QGridLayout) -> None:
        while layout.count():
            child = layout.takeAt(0)
            widget = child.widget()
            if widget is not None:
                widget.deleteLater()

    def _render_action_button(self, action: ProviderAction, *, busy: bool) -> QPushButton:
        button = QPushButton(action.label)
        button.setObjectName(f"action-{action.action_id}")
        icon_name = self._action_icon_name(action.action_id)
        if icon_name is not None:
            self._set_button_icon(button, icon_name)
        button.clicked.connect(
            lambda _checked=False, action_id=action.action_id: self._controller.trigger_action(action_id)
        )
        button.setEnabled(action.enabled and not busy)
        tooltip = action.description
        if not action.enabled and action.disabled_reason:
            tooltip = f"{action.description}\n{action.disabled_reason}".strip()
        button.setToolTip(tooltip)
        return button

    def _action_icon_name(self, action_id: str) -> str | None:
        icon_map = {
            "refresh": "SYNC",
            "whoami": "CONTACT",
            "sso-login": "LINK",
            "logout": "POWER_BUTTON",
            "activate": "PLAY_SOLID",
            "open-config": "FOLDER",
            "copy-export": "COPY",
        }
        return icon_map.get(action_id)

    def _workspace_tab_icon_name(self, tab_id: str) -> str | None:
        icon_map = {
            "overview": "HOME",
            "s3": "CLOUD",
            "ec2": "DEVELOPER_TOOLS",
            "iam": "PEOPLE",
            "cloudwatch": "HISTORY",
            "actions": "ROBOT",
        }
        return icon_map.get(tab_id)

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
        if self._rendering_state:
            return
        item = self._provider_tree.currentItem()
        if item is None:
            return
        provider_id = item.data(0, Qt.UserRole)
        if provider_id:
            self._set_sensitive_visibility(False)
            self._controller.set_current_provider(provider_id)

    def _on_profile_selection_changed(self) -> None:
        if self._rendering_state:
            return
        item = self._profile_tree.currentItem()
        if item is None:
            return
        provider_id = item.data(0, Qt.UserRole)
        profile_id = item.data(1, Qt.UserRole)
        if provider_id and profile_id:
            self._set_sensitive_visibility(False)
            self._controller.select_profile(provider_id, profile_id)

    def _on_auth_method_selection_changed(self) -> None:
        if self._rendering_state:
            return
        item = self._auth_methods_tree.currentItem()
        if item is None:
            return
        method_value = item.data(0, Qt.UserRole)
        if not method_value:
            return
        try:
            method = AuthMethod(method_value)
        except ValueError:
            self.render_state()
            return
        if method == self._controller.selected_auth_method():
            return
        if not self._controller.select_auth_method(method):
            self.render_state()

    def _on_lock_session_clicked(self) -> None:
        self._controller.lock_session()

    def _on_unlock_session_clicked(self) -> None:
        self._controller.unlock_session()

    def _on_s3_refresh_buckets_clicked(self) -> None:
        self._controller.refresh_aws_s3_buckets()

    def _on_s3_refresh_bucket_clicked(self) -> None:
        self._controller.refresh_aws_s3_objects()

    def _on_s3_apply_prefix_clicked(self) -> None:
        self._controller.set_aws_s3_prefix_filter(self._workspace_s3_prefix_input.text())
        self._controller.refresh_aws_s3_objects()

    def _on_s3_clear_prefix_clicked(self) -> None:
        self._controller.set_aws_s3_prefix_filter("")
        self._controller.refresh_aws_s3_objects()

    def _on_s3_copy_uri_clicked(self) -> None:
        self._controller.copy_aws_s3_uri()

    def _on_s3_upload_browse_clicked(self) -> None:
        current_path = self._workspace_s3_upload_source_input.text().strip()
        start_path = current_path
        if current_path:
            current_file = Path(current_path)
            if current_file.exists() and current_file.is_file():
                start_path = str(current_file.parent)
        selected_path, _selected_filter = QFileDialog.getOpenFileName(
            self,
            "Choose a file to upload",
            start_path,
        )
        if selected_path:
            self._controller.set_aws_s3_upload_source_path(selected_path)

    def _on_s3_upload_clear_clicked(self) -> None:
        self._controller.clear_aws_s3_upload_selection()

    def _on_s3_upload_source_text_changed(self, value: str) -> None:
        if self._rendering_state:
            return
        self._controller.set_aws_s3_upload_source_path(value)

    def _on_s3_upload_key_text_changed(self, value: str) -> None:
        if self._rendering_state:
            return
        self._controller.set_aws_s3_upload_object_key(value)

    def _on_s3_upload_clicked(self) -> None:
        self._controller.upload_aws_s3_file()

    def _on_s3_signed_url_duration_changed(self, value: int) -> None:
        self._controller.set_aws_s3_signed_url_duration_value(value)

    def _on_s3_signed_url_unit_changed(self, value: str) -> None:
        self._controller.set_aws_s3_signed_url_duration_unit(value.lower())

    def _on_s3_generate_signed_url_clicked(self) -> None:
        self._controller.generate_aws_s3_signed_url()

    def _on_s3_copy_signed_url_clicked(self) -> None:
        self._controller.copy_aws_s3_signed_url()

    def _on_s3_use_generated_url_clicked(self) -> None:
        self._controller.use_generated_aws_s3_signed_url_for_testing()

    def _on_s3_analyse_url_clicked(self) -> None:
        self._controller.set_aws_s3_test_url_input(self._workspace_s3_url_tester_input.toPlainText())
        self._controller.analyse_aws_s3_test_url()

    def _on_s3_validate_url_clicked(self) -> None:
        self._controller.set_aws_s3_test_url_input(self._workspace_s3_url_tester_input.toPlainText())
        self._controller.validate_aws_s3_test_url()

    def _on_s3_url_tester_text_changed(self) -> None:
        if self._rendering_state:
            return
        self._refresh_s3_url_tester_button_state()

    def _on_s3_bucket_selection_changed(self) -> None:
        if self._rendering_state:
            return
        item = self._workspace_s3_bucket_tree.currentItem()
        if item is None:
            return
        bucket_name = item.data(0, Qt.UserRole)
        if bucket_name:
            self._controller.select_aws_s3_bucket(bucket_name)

    def _on_s3_object_selection_changed(self) -> None:
        if self._rendering_state:
            return
        item = self._workspace_s3_object_tree.currentItem()
        if item is None:
            return
        object_key = item.data(0, Qt.UserRole)
        if object_key:
            self._controller.select_aws_s3_object(object_key)

    def _show_about_dialog(self) -> None:
        QMessageBox.about(self, "About CloudSprocket", self.about_text())

    def _display_field_value(self, field: DetailField) -> str:
        if field.sensitive and not self._show_sensitive_values:
            return "Hidden until revealed"
        return field.value

    def _refresh_s3_url_tester_button_state(self) -> None:
        has_input = bool(self._workspace_s3_url_tester_input.toPlainText().strip())
        busy = self._controller.session_state.command_state.value == "running"
        self._workspace_s3_use_generated_url_button.setEnabled(bool(self._controller.aws_s3_workspace().signed_url))
        self._workspace_s3_analyse_url_button.setEnabled(has_input)
        self._workspace_s3_validate_url_button.setEnabled(has_input and not busy)

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
        tree.setTextElideMode(Qt.ElideMiddle)
        tree.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        tree.setHorizontalScrollMode(QAbstractItemView.ScrollPerPixel)
        tree.header().setHighlightSections(False)










