# All the methods to test, per smart contract

Normal method names: not tested.

*Italic method names*: tested.

## MultiManagersBaseContract (tested by Aalto)

- changeOwner()
- addManager()
- revokeManagerCert()
- MultiManagers interface conformance

## AbstractMarketPlace (tested by Aalto)

- ERC165 interface conformance
- Marketplace interface conformance

## AbstractAuthorisedOwnerManageableMarketPlace (via SMAUGMarketPlace)

*- AuthorisedManageableMarketPlace interface conformance*
*- getMarketInformation()*
*- resetAccessTokens()*
*- submitRequest() & isRequestDefined() & getRequest() & getOpenRequestIdentifiers()*

## SMAUGMarketPlace

*- RequestArrayExtra interface conformance*
*- OfferArrayExtra interface conformance*
*- getType()*
*- closeRequest() & getClosedRequestIdentifiers()*
*- decideRequest() & isRequestDecided() & getRequestDecision()*
*- deleteRequest()*
*- submitRequestArrayExtra() & getRequestExtra()*
*- submitOffer() & isOfferDefined() & getOffer() & getRequestOfferIDs()*
*- submitOfferArrayExtra() & getOfferExtra()*
*- interledgerReceive()*