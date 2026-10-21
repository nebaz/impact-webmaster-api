const API_URL = 'https://api.impact.com/Mediapartners/';
const DEFAULT_CURRENCY = 'EUR';
const STATUS_REJECTED = 'rejected';
const STATUS_OPEN = 'open';
const STATUS_APPROVED = 'approved';

class ImpactApi {

  constructor(sid, token, currency) {
    this.sid = sid;
    this.token = token;
    this.currency = currency || DEFAULT_CURRENCY;
  }

  async getOfferData(offerId) {
    let method = 'Campaigns/' + offerId;
    return await this.apiRequest(method);
  }

  async getOffersData() {
    let method = 'Campaigns';
    let params = new Map();
    params.set('PageSize', 1000);
    let result = await this.apiRequest(method, params);
    if (!result.ok) {
      return result;
    }
    for (let offer of result.result.Campaigns) {
      offer.id = parseInt(offer.CampaignId);
    }
    return {ok: true, result: result.result.Campaigns};
  }

  async getLeadsByOfferId(dateFrom, dateTo, offerId = null) {
    let method = 'Actions';
    let params = new Map();
    params.set('ActionDateStart', new Date(dateFrom).toISOString().slice(0, 10) + 'T00:00:00Z');
    params.set('ActionDateEnd', new Date(dateTo).toISOString().slice(0, 10) + 'T23:59:59Z');
    if (offerId) {
      params.set('CampaignId', offerId);
    }

    let apiData = await this.apiRequest(method, params);
    if (!apiData.ok) {
      return apiData;
    }
    if (Array.isArray(apiData.result?.Actions)) {
      apiData.result.Actions.map(it => {
        it.orderId = it.Id;
        it.offerId = Number(it.CampaignId);
        it.offerName = it.CampaignName;
        it.currency = it.Currency;
        it.status = this.#getLeadStatus(it.State);
        it.commission = Number(it.Payout) || 0;
        it.subaccount = it.SubId1 ?? null;
        it.subaccount2 = it.SubId2 ?? null;
        it.subaccount3 = it.SubId3 ?? null;
        it.leadTime = new Date(it.EventDate).valueOf();
      });
      apiData.result = apiData.result.Actions;
    }
    return apiData;
  }


  /**
   * short grouped statistics by offer
   * @return {ok: boolean, result: Array {offerId,clicks,leadsOpen,commissionOpen,...}}
   */
  async getStatisticsOffers(dateFrom, dateTo, offerId = null, subid = null) {
    let result = new Map();
    let defaultResultItem = {
      offerId: 0,
      offerName: '',
      currency: '',
      clicks: 0,
      leads: 0,
      leadsRejected: 0,
      leadsOpen: 0,
      leadsApproved: 0,
      commissionRejected: 0,
      commissionOpen: 0,
      commissionApproved: 0,
      cr: 0
    }
    if (offerId) {
      result.set(offerId, {...defaultResultItem, offerId});
    }
    let apiData = await this.getLeadsByOfferId(dateFrom, dateTo, offerId);

    if (!apiData.ok) {
      return apiData;
    }
    if (apiData && Array.isArray(apiData.result)) {
      if (subid) {
        apiData.result = apiData.result.filter(it => it.subaccount === subid);
      }
      for (let it of apiData.result) {
        let resultItem = result.get(it.offerId) ?? {...defaultResultItem};
        resultItem.currency = it.currency;
        resultItem.offerId = it.offerId;
        resultItem.offerName = it.offerName;
        resultItem.leads++;
        if (it.status === STATUS_APPROVED) {
          resultItem.leadsApproved++;
          resultItem.commissionApproved += it.commission;
        }
        if (it.status === STATUS_OPEN) {
          resultItem.leadsOpen++;
          resultItem.commissionOpen += it.commission;
        }
        if (it.status === STATUS_REJECTED) {
          resultItem.leadsRejected++;
          resultItem.commissionRejected += it.commission;
        }
        result.set(it.offerId, resultItem);
      }
    }
    result = [...result.values()];
    for (let item of result) {
      item.ar = item.leads ? Math.round(item.leadsApproved / item.leads * 10000) / 100 : 0
    }

    // add clicks to data
    apiData = await this.getStatisticsOffersImpact(dateFrom, dateTo, offerId, subid);
    if (!apiData.ok) {
      return apiData;
    }
    for (let item of result) {
      item.clicks = apiData.result.find(it => it.offerId === item.offerId)?.clicks || 0;
      item.cr = Number(item.clicks) ? Math.round(item.leads / Number(item.clicks) * 10000) / 100 : 0;
    }

    return {ok: true, result};
  }

  async getStatisticsOffersImpact(dateFrom, dateTo, offerIds = null, subid = null) {
    let method = 'Reports/partner_performance_by_program';
    dateFrom = this.#formatDate(dateFrom);
    dateTo = this.#formatDate(dateTo);
    let params = new Map();
    params.set('START_DATE', dateFrom);
    params.set('END_DATE', dateTo);
    params.set('CONV_CURRENCY', this.currency);
    if (offerIds) {
      params.set('PUB_CAMPAIGN_MS', Array.isArray(offerIds) ? offerIds.join(',') : offerIds);
    }
    if (subid) {
      params.set('PUB_SUBID1', subid);
      method = 'Reports/partner_performance_by_subid';
    }

    let campaigns = await this.getAllCampaigns(dateFrom, dateTo);
    if (!campaigns.ok) {
      return campaigns;
    }

    let result = await this.apiRequest(method, params);
    if (!result.ok) {
      return result;
    }

    if (Array.isArray(result.result.Records)) {
      result = result.result.Records.map(it => ({
        offerId: campaigns.result.get(it.Campaign),
        offerName: it.Campaign,
        currency: this.currency,
        clicks: Number(it.Clicks) || 0,
        leads: Number(it.Actions) || 0,
        leadsRejected: 0,
        leadsOpen: 0,
        leadsApproved: 0,
        commissionRejected: 0,
        commissionOpen: Number(it.Total_Cost) || 0,
        commissionApproved: 0,
        cr: Number(it.Clicks) ? Math.round(it.Actions / Number(it.Clicks) * 10000) / 100 : 0,
        ar: 0
      }));
    }

    return {ok: true, result};
  }

  async getOfferLinkByOfferId(offerId) {
    let result = await this.getOfferData(offerId);
    if (result.ok && result.result?.ContractStatus === 'Active') {
      return {ok: true, result: result.result.TrackingLink};
    } else {
      return {ok: false, errorMessage: result.errorMessage || 'error'};
    }
  }

  async getAllCampaigns(dateFrom, dateTo) {
    let method = 'Reports/PerformanceByCampaigns';
    dateFrom = this.#formatDate(dateFrom);
    dateTo = this.#formatDate(dateTo);
    let params = new Map();
    params.set('START_DATE', dateFrom);
    params.set('END_DATE', dateTo);
    let result = await this.apiRequest(method, params);
    if (!result.ok) {
      return result;
    }
    const campaigns = new Map();
    for (let row of result.result.PerformanceByCampaigns) {
      campaigns.set(row.Campaign, Number(row.CampaignId));
    }
    return {ok: true, result: campaigns};
  }

  #formatDate(timestamp) {
    let mm = new Date(timestamp).getUTCMonth() + 1;
    let dd = new Date(timestamp).getUTCDate();
    return [new Date(timestamp).getUTCFullYear(), (mm > 9 ? '' : '0') + mm, (dd > 9 ? '' : '0') + dd].join('-');
  }

  #getLeadStatus(status) {
    switch (status) {
      case 'REVERSED':
        return STATUS_REJECTED;
      case 'PENDING':
        return STATUS_OPEN;
      case 'APPROVED':
        return STATUS_APPROVED;
      default:
        return status;
    }
  }

  async apiRequest(method, params) {
    let result;
    try {
      const url = new URL(API_URL + this.sid + '/' + method);
      url.search = new URLSearchParams(params).toString();
      // console.info('ImpactApiRequest', new Date().toLocaleString(), url);
      result = await (await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Basic ' + btoa(this.sid + ':' + this.token)
        }
      })).json();
    } catch (e) {
      console.error('impact api error', e);
    }
    // console.info('ImpactApiResponse', new Date().toLocaleString(), result);
    if (!result || result.Status === 'ERROR' || result.status) {
      console.error('impact api error: ', result);
      return {ok: false, errorMessage: result?.Message || result?.title};
    }
    return {ok: true, result: result};
  }

}

module.exports = ImpactApi;
