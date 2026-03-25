from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
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
        self._session_tabs = QTabWidget()
        self._workspace_tabs = QTabWidget()
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
        self._workspace_s3_selected_bucket_label = QLabel()
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
        self._workspace_s3_browser_splitter = QSplitter(Qt.Horizontal)
        self._workspace_s3_tools_tabs = QTabWidget()
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
    def workspace_s3_browser_splitter(self) -> QSplitter:
        return self._workspace_s3_browser_splitter

    @property
    def workspace_s3_tools_tabs(self) -> QTabWidget:
        return self._workspace_s3_tools_tabs

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
        self._apply_theme()

    def _apply_theme(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow, QWidget {
                background-color: #eef3f8;
                color: #14263a;
            }
            QMenuBar, QStatusBar {
                background-color: #eef3f8;
                color: #14263a;
            }
            QMenuBar::item:selected {
                background-color: #dce8f4;
            }
            QGroupBox {
                background-color: #fbfdff;
                border: 1px solid #c6d5e4;
                border-radius: 14px;
                margin-top: 16px;
                padding: 12px;
                padding-top: 18px;
                font-weight: 700;
                color: #1a4263;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 6px;
                color: #1a4263;
                background-color: #fbfdff;
            }
            QPushButton {
                background-color: #1d5f8e;
                color: #ffffff;
                border: 1px solid #174968;
                border-radius: 10px;
                padding: 8px 14px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #2572a8;
            }
            QPushButton:pressed {
                background-color: #154768;
            }
            QPushButton:disabled {
                background-color: #d5dee7;
                color: #687b8e;
                border-color: #c5d0db;
            }
            QLineEdit, QPlainTextEdit, QTreeWidget, QComboBox, QSpinBox {
                background-color: #ffffff;
                color: #14263a;
                border: 1px solid #bfd0df;
                border-radius: 10px;
                selection-background-color: #205c8a;
                selection-color: #ffffff;
            }
            QLineEdit, QPlainTextEdit, QComboBox, QSpinBox {
                padding: 7px 10px;
            }
            QTreeWidget {
                alternate-background-color: #f4f8fc;
                gridline-color: #d6e1eb;
            }
            QTreeWidget::item {
                padding: 4px 6px;
            }
            QTreeWidget::item:selected {
                background-color: #205c8a;
                color: #ffffff;
            }
            QHeaderView::section {
                background-color: #e7f0f7;
                color: #17334d;
                padding: 8px 8px;
                border: none;
                border-bottom: 1px solid #c6d5e4;
                font-weight: 700;
            }
            QTabWidget::pane {
                border: 1px solid #c6d5e4;
                border-radius: 12px;
                background: #fbfdff;
                top: -1px;
            }
            QTabBar::tab {
                background: #dfe8f1;
                color: #23445f;
                border: 1px solid #c6d5e4;
                border-bottom: none;
                border-top-left-radius: 10px;
                border-top-right-radius: 10px;
                padding: 9px 14px;
                margin-right: 4px;
                font-weight: 600;
            }
            QTabBar::tab:selected {
                background: #fbfdff;
                color: #0f2740;
            }
            QTabBar::tab:!selected:hover {
                background: #eaf1f8;
            }
            QSplitter::handle {
                background-color: #d4dfeb;
                margin: 2px;
            }
            QScrollBar:vertical, QScrollBar:horizontal {
                background: #e6edf4;
                border-radius: 6px;
            }
            QScrollBar::handle:vertical, QScrollBar::handle:horizontal {
                background: #9cb7cf;
                border-radius: 6px;
                min-height: 28px;
                min-width: 28px;
            }
            """
        )

    def _info_card_style(self, *, emphasised: bool = False) -> str:
        background = "#e4eff9" if emphasised else "#f3f7fb"
        border = "#b5cade" if emphasised else "#c8d6e3"
        foreground = "#17324d" if emphasised else "#29445d"
        return (
            "padding: 11px 13px; "
            f"background: {background}; "
            f"border: 1px solid {border}; "
            "border-radius: 12px; "
            f"color: {foreground};"
        )

    def _section_label_style(self) -> str:
        return "font-size: 13px; font-weight: 700; color: #184b72; padding-top: 4px;"

    def _build_header(self) -> QHBoxLayout:
        title = QLabel(self._settings.app_brand_name)
        title.setObjectName("title")
        title.setStyleSheet("font-size: 30px; font-weight: 700; color: #10283f;")

        subtitle = QLabel(APP_DESCRIPTION)
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("color: #395066; font-size: 14px;")

        byline = QLabel(f"Created by {self._settings.author_name}")
        byline.setStyleSheet("color: #184b72; font-size: 13px; font-weight: 600;")

        self._config_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self._config_label.setStyleSheet(self._info_card_style(emphasised=True))

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

    def _build_session_setup_panel(self) -> QGroupBox:
        group = QGroupBox("Session Setup")
        layout = QVBoxLayout(group)
        self._session_provider_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_profile_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_auth_label.setStyleSheet("font-size: 14px; font-weight: 700; color: #17324d;")
        self._session_lock_hint_label.setWordWrap(True)
        self._session_lock_hint_label.setStyleSheet(self._info_card_style())
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
        self._workspace_unlock_button.clicked.connect(self._on_unlock_session_clicked)

        text_layout = QVBoxLayout()
        text_layout.addWidget(self._workspace_title)
        text_layout.addWidget(self._workspace_subtitle)
        text_layout.addWidget(self._workspace_meta)

        layout.addLayout(text_layout, 1)
        layout.addWidget(self._workspace_unlock_button, 0, Qt.AlignTop)
        return group

    def _build_body(self) -> QSplitter:
        self._body_stack.addWidget(self._build_session_page())
        self._body_stack.addWidget(self._build_workspace_page())

        root_splitter = QSplitter(Qt.Vertical)
        root_splitter.setChildrenCollapsible(False)
        root_splitter.addWidget(self._body_stack)
        root_splitter.addWidget(self._build_log_panel())
        root_splitter.setStretchFactor(0, 5)
        root_splitter.setStretchFactor(1, 2)
        return root_splitter

    def _build_session_page(self) -> QWidget:
        navigation_splitter = QSplitter(Qt.Vertical)
        navigation_splitter.setChildrenCollapsible(False)
        navigation_splitter.addWidget(self._build_provider_panel())
        navigation_splitter.addWidget(self._build_profile_panel())
        navigation_splitter.setStretchFactor(0, 2)
        navigation_splitter.setStretchFactor(1, 3)

        self._session_tabs.setDocumentMode(True)
        self._session_tabs.addTab(self._build_overview_tab(), "Profile")
        self._session_tabs.addTab(self._build_access_tab(), "Access")
        self._session_tabs.addTab(self._build_actions_tab(), "Actions")

        session_content = QWidget()
        session_content_layout = QVBoxLayout(session_content)
        session_content_layout.setContentsMargins(0, 0, 0, 0)
        session_content_layout.setSpacing(16)
        session_content_layout.addWidget(self._build_session_setup_panel())
        session_content_layout.addWidget(self._session_tabs, 1)

        session_splitter = QSplitter(Qt.Horizontal)
        session_splitter.setChildrenCollapsible(False)
        session_splitter.addWidget(navigation_splitter)
        session_splitter.addWidget(session_content)
        session_splitter.setStretchFactor(0, 2)
        session_splitter.setStretchFactor(1, 5)
        session_splitter.setSizes([360, 980])
        return session_splitter

    def _build_workspace_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)
        layout.addWidget(self._build_workspace_header())
        self._workspace_tabs.setDocumentMode(True)
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
        layout.setSpacing(16)

        self._workspace_s3_status_label.setWordWrap(True)
        self._workspace_s3_status_label.setStyleSheet(self._info_card_style(emphasised=True))
        self._workspace_s3_selected_bucket_label.setWordWrap(True)
        self._workspace_s3_selected_bucket_label.setStyleSheet(
            "padding: 8px 12px; background: #edf4fb; border: 1px solid #c5d5e4; "
            "border-radius: 10px; font-size: 13px; font-weight: 700; color: #17324d;"
        )
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
        self._workspace_s3_signed_url_output.setMinimumHeight(140)
        self._workspace_s3_url_tester_status_label.setWordWrap(True)
        self._workspace_s3_url_tester_status_label.setStyleSheet(self._info_card_style())
        self._workspace_s3_url_tester_input.setPlaceholderText("Paste any URL here, including a signed URL received from someone else.")
        self._workspace_s3_url_tester_input.setMinimumHeight(96)
        self._workspace_s3_url_tester_details_tree.setColumnCount(2)
        self._workspace_s3_url_tester_details_tree.setHeaderLabels(["Field", "Value"])
        self._configure_data_tree(self._workspace_s3_url_tester_details_tree)
        self._workspace_s3_url_tester_details_tree.setUniformRowHeights(False)
        self._workspace_s3_url_tester_details_tree.setWordWrap(True)
        self._workspace_s3_url_tester_details_tree.header().setStretchLastSection(False)
        self._workspace_s3_url_tester_details_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_url_tester_details_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self._workspace_s3_url_tester_details_tree.setColumnWidth(0, 220)

        self._workspace_s3_bucket_tree.setColumnCount(3)
        self._workspace_s3_bucket_tree.setHeaderLabels(["Bucket", "Created", "Summary"])
        self._configure_data_tree(self._workspace_s3_bucket_tree)
        self._workspace_s3_bucket_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_bucket_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._workspace_s3_bucket_tree.header().setSectionResizeMode(2, QHeaderView.Stretch)
        self._workspace_s3_bucket_tree.setColumnWidth(0, 220)

        self._workspace_s3_object_tree.setColumnCount(4)
        self._workspace_s3_object_tree.setHeaderLabels(["Key", "Size", "Modified", "Storage Class"])
        self._configure_data_tree(self._workspace_s3_object_tree)
        self._workspace_s3_object_tree.header().setSectionResizeMode(0, QHeaderView.Interactive)
        self._workspace_s3_object_tree.header().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.header().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.header().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self._workspace_s3_object_tree.setColumnWidth(0, 460)

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
        bucket_hint = QLabel("Choose a bucket to browse its objects and generate S3 actions.")
        bucket_hint.setWordWrap(True)
        bucket_hint.setStyleSheet(self._info_card_style())
        bucket_layout.addWidget(bucket_hint)
        bucket_layout.addWidget(self._workspace_s3_bucket_tree, 1)
        bucket_group.setMinimumWidth(280)

        object_group = QGroupBox("Objects")
        object_layout = QVBoxLayout(object_group)
        object_layout.setSpacing(12)
        object_layout.addWidget(self._workspace_s3_selected_bucket_label)
        object_layout.addWidget(self._workspace_s3_object_status_label)
        object_layout.addWidget(self._workspace_s3_object_tree, 1)
        object_group.setMinimumWidth(420)

        object_details_page = QWidget()
        object_details_layout = QVBoxLayout(object_details_page)
        object_details_layout.setContentsMargins(0, 0, 0, 0)
        object_details_layout.setSpacing(12)
        object_details_hint = QLabel("Inspect the selected object metadata, headers, and storage details.")
        object_details_hint.setWordWrap(True)
        object_details_hint.setStyleSheet(self._info_card_style())
        object_details_layout.addWidget(object_details_hint)
        object_details_layout.addWidget(self._workspace_s3_object_details_tree, 1)

        signed_url_page = QWidget()
        signed_url_layout = QVBoxLayout(signed_url_page)
        signed_url_layout.setContentsMargins(0, 0, 0, 0)
        signed_url_layout.setSpacing(12)
        signed_url_hint = QLabel("Generate or copy a presigned URL for the selected object without leaving the app.")
        signed_url_hint.setWordWrap(True)
        signed_url_hint.setStyleSheet(self._info_card_style())
        signed_url_controls = QHBoxLayout()
        signed_url_controls.addWidget(QLabel("Duration"))
        signed_url_controls.addWidget(self._workspace_s3_signed_url_duration_spin)
        signed_url_controls.addWidget(self._workspace_s3_signed_url_duration_unit_combo)
        signed_url_controls.addWidget(self._workspace_s3_generate_signed_url_button)
        signed_url_controls.addWidget(self._workspace_s3_copy_signed_url_button)
        signed_url_controls.addStretch(1)
        signed_url_layout.addWidget(signed_url_hint)
        signed_url_layout.addWidget(self._workspace_s3_signed_url_status_label)
        signed_url_layout.addLayout(signed_url_controls)
        signed_url_layout.addWidget(self._workspace_s3_signed_url_output, 1)

        url_tester_page = QWidget()
        url_tester_layout = QVBoxLayout(url_tester_page)
        url_tester_layout.setContentsMargins(0, 0, 0, 0)
        url_tester_layout.setSpacing(12)
        url_tester_hint = QLabel("Paste any URL to inspect expiry hints or validate that it still responds.")
        url_tester_hint.setWordWrap(True)
        url_tester_hint.setStyleSheet(self._info_card_style())
        url_tester_controls = QHBoxLayout()
        url_tester_controls.addWidget(self._workspace_s3_use_generated_url_button)
        url_tester_controls.addWidget(self._workspace_s3_analyse_url_button)
        url_tester_controls.addWidget(self._workspace_s3_validate_url_button)
        url_tester_controls.addStretch(1)
        url_tester_layout.addWidget(url_tester_hint)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_status_label)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_input)
        url_tester_layout.addLayout(url_tester_controls)
        url_tester_layout.addWidget(self._workspace_s3_url_tester_details_tree, 1)

        self._workspace_s3_tools_tabs.setDocumentMode(True)
        self._workspace_s3_tools_tabs.clear()
        self._workspace_s3_tools_tabs.addTab(object_details_page, "Object Details")
        self._workspace_s3_tools_tabs.addTab(signed_url_page, "Signed URL")
        self._workspace_s3_tools_tabs.addTab(url_tester_page, "URL Tester")

        tools_group = QGroupBox("S3 Tools")
        tools_layout = QVBoxLayout(tools_group)
        tools_layout.addWidget(self._workspace_s3_tools_tabs, 1)
        tools_group.setMinimumWidth(380)

        controls_layout = QHBoxLayout()
        controls_layout.addWidget(QLabel("Prefix"))
        controls_layout.addWidget(self._workspace_s3_prefix_input, 1)
        controls_layout.addWidget(self._workspace_s3_apply_prefix_button)
        controls_layout.addWidget(self._workspace_s3_clear_prefix_button)
        controls_layout.addWidget(self._workspace_s3_refresh_buckets_button)
        controls_layout.addWidget(self._workspace_s3_refresh_bucket_button)
        controls_layout.addWidget(self._workspace_s3_copy_uri_button)
        controls_layout.addStretch(1)

        self._workspace_s3_browser_splitter.setChildrenCollapsible(False)
        self._workspace_s3_browser_splitter.addWidget(bucket_group)
        self._workspace_s3_browser_splitter.addWidget(object_group)
        self._workspace_s3_browser_splitter.addWidget(tools_group)
        self._workspace_s3_browser_splitter.setStretchFactor(0, 2)
        self._workspace_s3_browser_splitter.setStretchFactor(1, 4)
        self._workspace_s3_browser_splitter.setStretchFactor(2, 3)
        self._workspace_s3_browser_splitter.setSizes([280, 620, 420])

        layout.addWidget(self._workspace_s3_status_label)
        layout.addLayout(controls_layout)
        layout.addWidget(self._workspace_s3_browser_splitter, 1)
        return page

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
            self._workspace_tabs.addTab(page, tab.label)
            if tab.tab_id == current_tab_id:
                next_index = index
        if self._workspace_tabs.count():
            self._workspace_tabs.setCurrentIndex(next_index)

    def _render_workspace_s3(self) -> None:
        state = self._controller.aws_s3_workspace()
        available, reason = self._controller.aws_s3_availability()
        self._workspace_s3_status_label.setText(state.status_message or reason)
        if state.selected_bucket_name:
            object_count = len(state.objects)
            object_label = "object" if object_count == 1 else "objects"
            prefix_label = f" | Prefix: {state.prefix_filter}" if state.prefix_filter else ""
            self._workspace_s3_selected_bucket_label.setText(
                f"Bucket: {state.selected_bucket_name} | {object_count} {object_label} visible{prefix_label}"
            )
        else:
            self._workspace_s3_selected_bucket_label.setText("Select a bucket to browse its objects.")
        if self._workspace_s3_prefix_input.text() != state.prefix_filter:
            self._workspace_s3_prefix_input.setText(state.prefix_filter)
        self._workspace_s3_refresh_buckets_button.setEnabled(self._controller.can_refresh_aws_s3_buckets())
        self._workspace_s3_refresh_bucket_button.setEnabled(self._controller.can_refresh_aws_s3_objects())
        self._workspace_s3_refresh_bucket_button.setVisible(available or state.selected_bucket_name is not None)
        self._workspace_s3_apply_prefix_button.setEnabled(available)
        self._workspace_s3_clear_prefix_button.setEnabled(available and bool(state.prefix_filter))
        self._workspace_s3_copy_uri_button.setEnabled(state.selected_bucket_name is not None)
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
            item = QTreeWidgetItem([bucket.name, bucket.created_at, bucket.summary])
            item.setData(0, Qt.UserRole, bucket.name)
            self._workspace_s3_bucket_tree.addTopLevelItem(item)
            if bucket.name == state.selected_bucket_name:
                selected_bucket_item = item
        if selected_bucket_item is not None:
            self._workspace_s3_bucket_tree.setCurrentItem(selected_bucket_item)
        self._workspace_s3_bucket_tree.blockSignals(False)
        self._workspace_s3_bucket_tree.resizeColumnToContents(0)
        self._workspace_s3_bucket_tree.resizeColumnToContents(1)

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
