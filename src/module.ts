import './css/panel.base.scss';
import './css/panel.dark.scss';
import './css/panel.light.scss';

import './timepicker';

import { DatasourceRequest } from './models/datasource';

import { PanelCtrl } from 'grafana/app/plugins/sdk';
import { appEvents } from 'grafana/app/core/core';

import _ from 'lodash';
import $ from 'jquery';
import moment from 'moment';


const PANEL_DEFAULTS = {
  backendUrl: ''
}

type TimeRange = {
  from: moment.Moment,
  to: moment.Moment,
  raw: {
    from: moment.Moment,
    to: moment.Moment
  }
};

class Ctrl extends PanelCtrl {
  private readonly selfType = 'corpglory-data-exporter-panel';

  private _panelPath: string;
  private _partialsPath: string;
  public showRows: TDictionary<number, boolean>;
  private _element: JQuery;
  public rangeOverride: TimeRange = {
    from: moment(),
    to: moment(),
    raw: {
      from: moment(),
      to: moment()
    }
  };
  public datePickerShow: {
    from: Boolean,
    to: Boolean
  };
  private _datasourceRequests: TDictionary<number, DatasourceRequest>;
  private _datasourceTypes: TDictionary<number, string>;
  private _datasources: any;
  private _user: string;

  static templateUrl = 'partials/module.html';
  private timeSrv: any;
  private range: any;

  /** @ngInject */
  constructor($scope, $injector, private backendSrv, public templateSrv) {
    super($scope, $injector);
    _.defaults(this.panel, PANEL_DEFAULTS);
    this._panelPath = `/public/plugins/${this.pluginId}`;
    this._partialsPath = `${this._panelPath}/partials`;
    this._datasourceRequests = {};
    this._datasources = {};
    this._datasourceTypes = {};

    this.events.on('refresh', this._onRefresh.bind(this));
    this.events.on('init-edit-mode', this._onInitEditMode.bind(this));

    this.timeSrv = $injector.get('timeSrv');

    appEvents.on('ds-request-response', data => {
      const requestConfig = data.config;
      const isSqlDatasource = requestConfig.data !== undefined &&
        requestConfig.data.queries !== undefined;

      if(isSqlDatasource) {
        for(let query of requestConfig.data.queries) {
          this._datasourceRequests[query.datasourceId] = {
            url: query.url,
            method: query.method,
            data: query.data,
            params: query.params
          };
        }
      } else {
        let matched = requestConfig.url.match(/proxy\/(\d+)/);
        if(matched === null) {
          console.error(`Cannot find datasource id in url ${requestConfig.url}`);
          return;
        }
        let datasourceId = matched[1];
        this._datasourceRequests[datasourceId] = {
          url: requestConfig.url,
          method: requestConfig.method,
          data: requestConfig.data,
          params: requestConfig.params
        };
      }
    });

    this.showRows = {};

    $(document.body).on('click', '.delete-task', e => {
      e.preventDefault();
      let url = $(e.currentTarget).attr('href');
      this._showConfirmationModal(url);
    });
  }

  link(scope, element: JQuery) {
    this._element = element;
    this._initStyles();

    for(let panel of this.panels) {
      this.showRows[panel.id] = false;
    }
  }

  private async _getCurrentUser() {
    if(this._user === undefined) {
      return await this.backendSrv.get('/api/user')
        .then(data => data.login);
    } else {
      return this._user;
    }
  }

  private async _getDatasourceByName(name: string) {
    if(this._datasources[name] === undefined) {
      return await this.backendSrv.get(`/api/datasources/name/${name}`);
    } else {
      return this._datasources[name];
    }
  }

  // TODO: specify return type here
  private async _getDefaultDatasource() {
    const datasources = await this.backendSrv.get(`/api/datasources`);

    return datasources.find(d => d.isDefault);
  }

  private _initStyles() {
    window.System.import(`${this._panelPath}/css/panel.base.css!`);
    if(window.grafanaBootData.user.lightTheme) {
      window.System.import(`${this._panelPath}/css/panel.light.css!`);
    } else {
      window.System.import(`${this._panelPath}/css/panel.dark.css!`);
    }
  }

  private _onRefresh() {
    this._element.find('.table-panel-scroll').css({ 'max-height': this._getTableHeight() });
    this.range = this.timeSrv.timeRange();
    this._getGrafanaAPIInfo();
  }

  private _onInitEditMode() {
    this.addEditorTab(
      'Options', `${this._partialsPath}/editor.options.html`, 2
    );
  }

  private _getTableHeight() {
    return this.height - 31 + 'px';
  }

  showExportModal(panelId: number | null, target) {
    this.clearRange();
    let modalScope = this.$scope.$new(true);
    modalScope.ctrl = this;
    modalScope.panelId = panelId;
    modalScope.target = target;

    appEvents.emit('show-modal', {
      src: `${this._partialsPath}/modal.export.html`,
      scope: modalScope
    });
  }

  private _showConfirmationModal(url) {
    let modalScope = this.$scope.$new(true);
    modalScope.ctrl = this;
    modalScope.url = url;

    appEvents.emit('show-modal', {
      src: `${this._partialsPath}/modal.confirmation.html`,
      modalClass: 'confirm-modal',
      scope: modalScope
    });
  }

  private async _getGrafanaAPIInfo() {
    this._user = await this._getCurrentUser();
    for(let panel of this.panels) {
      if(panel.type === this.selfType || panel.datasource === undefined) {
        continue;
      }

      if(panel.datasource === null) {
        const datasource = await this._getDefaultDatasource();
        panel.datasource = datasource?.name;

        this._datasourceTypes[panel.id] = datasource?.type;
      } else {
        const datasource = await this._getDatasourceByName(panel.datasource);
        this._datasourceTypes[panel.id] = datasource?.type
      }
    }
  }

  toggleTargetRows(panelId) {
    this.showRows[panelId] = !this.showRows[panelId];
    this.render();
  }

  onTimeRangeChange(timeRange: TimeRange): void {
    this.rangeOverride = timeRange;
  }

  private _formatDatasourceRequest(datasource: any): DatasourceRequest {
    if(datasource === undefined) {
      throw new Error(`Can't get info about "${name}" datasource`);
    }

    const datasourceId: number = datasource.id;

    if(datasource.access !== 'proxy') {
      throw new Error(`"${datasource.name}" datasource has "Browser" access type but only "Server" is supported`);
    }

    const datasourceRequest = this._datasourceRequests[datasourceId];
    if(datasourceRequest === undefined) {
      throw new Error('Datasource is not set. If it`s Grafana-test-datasource then it`s not supported');
    }

    if(datasourceRequest.type === undefined || datasourceRequest.type === null) {
      datasourceRequest.type = datasource.type;
    }
    if(datasourceRequest.datasourceId === undefined) {
      datasourceRequest.datasourceId = datasourceId;
    }

    return datasourceRequest;
  }

  async export(panelId: string | null, target: any): Promise<void> {

    const exportPanels = this.panels.filter(panel =>
      panel.datasource !== undefined &&
      panel.type !== this.selfType &&
      (panelId === null || panel.id === panelId)
    );

    let datasources = {};
    try {
      datasources = await this.backendSrv.get(`/api/datasources`) ;

      const exportTable = _.keyBy(exportPanels, 'datasource');
      datasources = (datasources as {name: string}[])
        .reduce((result, item) => {
        if (exportTable[item.name]) {
          result[item.name] = this._formatDatasourceRequest(item);
        }
        return result;
      });
    } catch (e) {
      appEvents.emit(
        'alert-error',
        [
          'Error while adding export task',
          e.message
        ]
      );

      return;
    }

    // TODO: support org_id
    const data = exportPanels.map(panel => ({
      panelUrl: window.location.origin + window.location.pathname + `?panelId=${panel.id}&fullscreen`,
      datasourceRequest: datasources[panel.datasource],
      datasourceName: panel.datasource
    }));

    let formattedUrl = this.templateSrv.replace(this.panel.backendUrl);
    if(!formattedUrl.includes('http://') && !formattedUrl.includes('https://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    if(formattedUrl.slice(-1) === '/') {
      formattedUrl = formattedUrl.slice(0, -1);
    }

    try {
      const resp = await this.backendSrv.post(`${formattedUrl}/tasks`, {
        from: this.rangeOverride.from.valueOf(),
        to: this.rangeOverride.to.valueOf(),
        data,
        target,
        user: this._user
      });

      appEvents.emit('alert-success', ['Task added', resp]);
      appEvents.emit('hide-modal');
      this.clearRange();
      this.timeSrv.refreshDashboard();
    } catch(err) {
      appEvents.emit('alert-error', [
        `Error while adding task at ${err.config.url}`,
        err.statusText !== '' ? err.statusText : 'grafana-data-exporter is not available'
      ]);
    }
  }

  getDatasource(panel) {
    let datasource = '';
    if(panel.datasource) {
      datasource += panel.datasource;
    } else {
      return '-';
    }
    if(this._datasourceTypes[panel.id]) {
      datasource += ` (${this._datasourceTypes[panel.id]})`;
    }
    return datasource;
  }

  clearRange() {
    this.rangeOverride = {
      from: this.range.from,
      to: this.range.to,
      raw: {
        from: this.range.from,
        to: this.range.to
      }
    };
    this.datePickerShow = {
      from: true,
      to: true
    };
    appEvents.emit('hide-modal');
  }

  onDelete(url) {
    this.backendSrv.get(url)
      .then(() => this.timeSrv.refreshDashboard());
    appEvents.emit('hide-modal');
  }

  get panels() {
    return this.dashboard.panels;
  }

}

export { Ctrl as PanelCtrl }
