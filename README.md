# impact.com API Integration

## Installation

To use the library, install it through [npm](https://npmjs.com)

```shell
npm install --save impact-webmaster-api
```

## Get API token here
* https://app.impact.com/secure/mediapartner/api/fr/api-access-tokens-ui.ihtml


## Usage
    const ImpactApi = require('impact-webmaster-api');
    const api = new ImpactApi(sid, token);
    let offers = await api.getOffersData();

## API
* getOfferData(int offerId): Object
* getOffersData(): Object
* getLeadsByOfferId(timestamp dateFrom, timestamp dateTo, int offerId?): Object
* getStatisticsOffers(timestamp dateFrom, timestamp dateTo, int offerId?, string subId?): Object
* getOfferLinkByOfferId(int offerId): Object
* apiRequest(method, params) - native impact api request
