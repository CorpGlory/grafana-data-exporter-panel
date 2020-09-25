import './css/panel.base.scss';
import './css/panel.dark.scss';
import './css/panel.light.scss';

import { PanelCtrl } from 'grafana/app/plugins/sdk';
import { appEvents } from 'grafana/app/core/core';

import _ from 'lodash';
import $ from 'jquery';
import moment from 'moment';


// TODO: add to types-grafana
declare var grafanaBootData: any;

const PANEL_DEFAULTS = {
  backendUrl: ''
}

class Ctrl extends PanelCtrl {
  private _panelPath: string;
  private _partialsPath: string;
  public showRows: Object;
  private _element;
  public rangeOverride: {
    from: string,
    to: string
  };
  public rangeOverrideRaw: {
    from: string,
    to: string
  };
  public datePickerShow: {
    from: Boolean,
    to: Boolean
  };
  private _datasourceRequests: any;
  private _datasourceTypes: any;
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

    appEvents.on('ds-request-response', async data => {
      const requestConfig = data.config;
      const isSqlDatasource = requestConfig.data !== undefined &&
        requestConfig.data.queries !== undefined;

      if(isSqlDatasource) {
        for(let query of requestConfig.data.queries) {
          if (!query.url) {
            const datasource = await this._getDatasourceById(query.datasourceId);

            query.url = datasource.url;
          }

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
          throw new Error(`Cannot find datasource id in url ${requestConfig.url}`);
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

  link(scope, element) {
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

  private _getDatasourceById(id: number) {
    const existedkey = this._datasources && Object.keys(this._datasources)
        .find(key => this._datasources[key].id === id);
    const existed = this._datasources[existedkey];

    if (existed) {
      return existed;
    }
    return this.backendSrv.get(`/api/datasources/${id}`);
  }

  // TODO: specify return type here
  private async _getDefaultDatasource() {
    const datasources = await this.backendSrv.get(`/api/datasources`);

    return datasources.find(d => d.isDefault);
  }

  private _initStyles() {
    (window as any).System.import(`${this._panelPath}/css/panel.base.css!`);
    if(grafanaBootData.user.lightTheme) {
      (window as any).System.import(`${this._panelPath}/css/panel.light.css!`);
    } else {
      (window as any).System.import(`${this._panelPath}/css/panel.dark.css!`);
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

  showExportModal(panelId, target) {
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
      if(panel.type === 'corpglory-data-exporter-panel' || panel.datasource === undefined) {
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

  onRangeFromChange() {
    this.rangeOverride.from = moment(this.rangeOverrideRaw.from).format();
  }

  onRangeToChange() {
    this.rangeOverride.to = moment(this.rangeOverrideRaw.to).format();
  }

  async export(panelId, target) {
    let panelUrl = window.location.origin + window.location.pathname + `?panelId=${panelId}&fullscreen`;

    let panel = this.panels.find(el => el.id === panelId);
    let datasourceName = panel.datasource;
    let datasource = await this._getDatasourceByName(datasourceName);
    let datasourceId = datasource.id;
    if(this._datasourceRequests[datasourceId] === undefined) {
      appEvents.emit('alert-error', ['Error while exporting from datasource', `Datasource ${datasourceName} is not available`]);
      throw new Error(`_datasourceRequests[${datasourceId}] is undefined`);
    }
    this._datasourceRequests[datasourceId].type = this._datasourceTypes[panelId];

    let formattedUrl = this.templateSrv.replace(this.panel.backendUrl);
    if(!formattedUrl.includes('http://')) {
      formattedUrl = `http://${formattedUrl}`;
    }
    if(formattedUrl.slice(-1) === '/') {
      formattedUrl = formattedUrl.slice(0, -1);
    }

    this.backendSrv.post(`${formattedUrl}/tasks`, {
      from: moment(this.rangeOverride.from).valueOf(),
      to: moment(this.rangeOverride.to).valueOf(),
      panelUrl,
      target,
      datasourceRequest: this._datasourceRequests[datasourceId],
      datasourceName,
      user: this._user
    })
      .then(data => {
        appEvents.emit('alert-success', ['Task added', data]);
        appEvents.emit('hide-modal');
        this.clearRange();
        this.timeSrv.refreshDashboard();
      })
      .catch(err => appEvents.emit('alert-error', [`Error while adding task at ${err.config.url}`, err.statusText]));
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
      from: this.range.from.toISOString(),
      to: this.range.to.toISOString()
    };
    this.rangeOverrideRaw = {
      from: this.range.from.toISOString(),
      to: this.range.to.toISOString()
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
