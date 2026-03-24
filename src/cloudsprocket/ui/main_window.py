from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction
from PySide6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QStatusBar,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from cloudsprocket.config import AppSettings
from cloudsprocket.models import DiscoveryReport, ProviderHealth
from cloudsprocket.services.auth import AuthStatusService
from cloudsprocket.services.profile_discovery import ProfileDiscoveryService


class MainWindow(QMainWindow):
    def __init__(
        self,
        *,
        settings: AppSettings,
        auth_service: AuthStatusService,
        profile_discovery: ProfileDiscoveryService,
    ) -> None:
        super().__init__()
        self._settings = settings
        self._auth_service = auth_service
        self._profile_discovery = profile_discovery

        self.setWindowTitle(settings.app_name)
        self.resize(1120, 720)

        self._auth_tree = QTreeWidget()
        self._profile_tree = QTreeWidget()
        self._status_bar = QStatusBar()
        self.setStatusBar(self._status_bar)

        self._build_ui()
        self.refresh_data()

    @property
    def auth_tree(self) -> QTreeWidget:
        return self._auth_tree

    @property
    def profile_tree(self) -> QTreeWidget:
        return self._profile_tree

    def refresh_data(self) -> None:
        auth_snapshot = self._auth_service.snapshot()
        discovery_report = self._profile_discovery.discover()
        self._render_auth_snapshot(auth_snapshot)
        self._render_discovery_report(discovery_report)

        warning_suffix = ""
        if discovery_report.warnings:
            warning_suffix = f" ({len(discovery_report.warnings)} warnings)"
        self._status_bar.showMessage(
            f"{len(auth_snapshot)} providers, {len(discovery_report.profiles)} profiles{warning_suffix}"
        )

    def _build_ui(self) -> None:
        refresh_action = QAction("Refresh", self)
        refresh_action.triggered.connect(self.refresh_data)
        self.menuBar().addAction(refresh_action)

        central = QWidget(self)
        root_layout = QVBoxLayout(central)
        root_layout.setContentsMargins(24, 24, 24, 24)
        root_layout.setSpacing(16)

        title = QLabel(self._settings.app_name)
        title.setObjectName("title")
        title.setStyleSheet("font-size: 28px; font-weight: 700;")

        subtitle = QLabel(
            "Desktop shell for cloud auth visibility and local profile discovery."
        )
        subtitle.setWordWrap(True)
        subtitle.setStyleSheet("color: #5f6b7a; font-size: 14px;")

        config_label = QLabel(f"Config root: {self._settings.config_dir}")
        config_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        config_label.setStyleSheet(
            "padding: 8px 12px; background: #eef3f8; border-radius: 8px;"
        )

        refresh_button = QPushButton("Refresh Snapshot")
        refresh_button.clicked.connect(self.refresh_data)
        refresh_button.setFixedWidth(160)

        header_row = QHBoxLayout()
        header_text = QVBoxLayout()
        header_text.addWidget(title)
        header_text.addWidget(subtitle)
        header_text.addWidget(config_label)
        header_row.addLayout(header_text, 1)
        header_row.addWidget(refresh_button, 0, Qt.AlignTop)

        panels_row = QHBoxLayout()
        panels_row.setSpacing(16)
        panels_row.addWidget(self._build_auth_panel(), 1)
        panels_row.addWidget(self._build_profile_panel(), 2)

        root_layout.addLayout(header_row)
        root_layout.addLayout(panels_row, 1)
        self.setCentralWidget(central)

    def _build_auth_panel(self) -> QGroupBox:
        group = QGroupBox("Auth And Tooling")
        layout = QVBoxLayout(group)
        self._auth_tree.setColumnCount(3)
        self._auth_tree.setHeaderLabels(["Provider", "State", "Summary"])
        self._auth_tree.setRootIsDecorated(False)
        self._auth_tree.setAlternatingRowColors(True)
        layout.addWidget(self._auth_tree)
        return group

    def _build_profile_panel(self) -> QGroupBox:
        group = QGroupBox("Discovered Profiles")
        layout = QVBoxLayout(group)
        self._profile_tree.setColumnCount(4)
        self._profile_tree.setHeaderLabels(["Provider", "Profile", "Source", "Details"])
        self._profile_tree.setRootIsDecorated(False)
        self._profile_tree.setAlternatingRowColors(True)
        layout.addWidget(self._profile_tree)
        return group

    def _render_auth_snapshot(self, snapshot: tuple[ProviderHealth, ...]) -> None:
        self._auth_tree.clear()
        for provider in snapshot:
            item = QTreeWidgetItem(
                [
                    provider.label,
                    provider.state.value,
                    provider.summary,
                ]
            )
            tooltip = "\n".join(str(path) for path in provider.locations)
            if tooltip:
                item.setToolTip(2, tooltip)
            self._auth_tree.addTopLevelItem(item)
        self._auth_tree.resizeColumnToContents(0)
        self._auth_tree.resizeColumnToContents(1)

    def _render_discovery_report(self, report: DiscoveryReport) -> None:
        self._profile_tree.clear()
        for profile in report.profiles:
            item = QTreeWidgetItem(
                [
                    profile.provider_id.upper(),
                    profile.display_name,
                    str(profile.source),
                    profile.details,
                ]
            )
            item.setToolTip(2, str(profile.source))
            self._profile_tree.addTopLevelItem(item)
        self._profile_tree.resizeColumnToContents(0)
        self._profile_tree.resizeColumnToContents(1)

