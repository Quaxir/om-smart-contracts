    // struct Offer {
    //     uint ID;
    //     uint requestID;
    //     address offerMaker;
    //     bool isDefined;
    //     Stage offStage;
    //     bool isSettled;
    // }

    // function getOffer(uint offerIdentifier) external view returns (uint8 status, uint requestID, address offerMaker, uint stage, bool isSettled) {
    //     if(!offers[offerIdentifier].isDefined) {
    //         return (UndefinedID, 0, address(0), 0, false);
    //     }
    //     require(offers[offerIdentifier].isDefined);

    //     return (Successful, offers[offerIdentifier].requestID, offers[offerIdentifier].offerMaker, uint(offers[offerIdentifier].offStage), offers[offerIdentifier].isSettled);
    // }